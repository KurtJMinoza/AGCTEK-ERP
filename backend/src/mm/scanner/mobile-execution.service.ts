import {
    Injectable,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ScannerEventService } from './scanner-event.service'
import { BarcodeResolveService } from './barcode-resolve.service'
import { MobileDeviceService } from './mobile-device.service'
import { ScannerEventDto } from './dto/scanner.dto'

export type MobileScanInput = ScannerEventDto & {
    sessionToken?: string
    offlineQueued?: boolean
    clientTimestamp?: string
    expectedSourceBinId?: string
    expectedTaskUpdatedAt?: string
}

function conflict(code: string, message: string): never {
    throw new ConflictException(`${code}: ${message}`)
}

@Injectable()
export class MobileExecutionService {
    constructor(
        private prisma: PrismaService,
        private devices: MobileDeviceService,
        private events: ScannerEventService,
        private resolve: BarcodeResolveService,
    ) {}

    async resolveBarcode(input: {
        barcode: string
        companyId?: string
        deviceId?: string
        userId?: string
        sessionToken?: string
    }) {
        if (input.deviceId) {
            await this.devices.assertAuthorized({
                deviceId: input.deviceId,
                companyId: input.companyId,
                userId: input.userId,
                sessionToken: input.sessionToken,
            })
        }
        return this.resolve.resolve(input.barcode, input.companyId)
    }

    async receivingScan(input: MobileScanInput) {
        return this.execute('RECEIVING', input)
    }

    async putawayScan(input: MobileScanInput) {
        await this.assertTaskFresh('PUTAWAY', input)
        return this.execute('PUTAWAY', input)
    }

    async pickingScan(input: MobileScanInput) {
        await this.assertTaskFresh('PICKING', input)
        return this.execute('PICKING', input)
    }

    async countingScan(input: MobileScanInput) {
        await this.assertTaskFresh('COUNTING', input)
        return this.execute('COUNTING', input)
    }

    /**
     * Offline sync: enqueue then validate+post via domain services.
     * Never blindly overwrites inventory — each item goes through processEvent.
     */
    async sync(input: {
        deviceId: string
        companyId?: string
        userId?: string
        sessionToken?: string
        events: MobileScanInput[]
    }) {
        const device = await this.devices.assertAuthorized({
            deviceId: input.deviceId,
            companyId: input.companyId,
            userId: input.userId,
            sessionToken: input.sessionToken,
            requireRegistered: true,
        })

        const results: any[] = []
        for (const ev of input.events.slice(0, 50)) {
            const payload = {
                ...ev,
                deviceId: input.deviceId,
                userId: ev.userId || input.userId || device.userId || '',
                companyId: ev.companyId || input.companyId || device.companyId,
                offlineQueued: true,
            }

            let queueRow = await this.prisma.mmMobileSyncQueue.findUnique({
                where: { idempotencyKey: payload.idempotencyKey },
            })
            if (!queueRow) {
                queueRow = await this.prisma.mmMobileSyncQueue.create({
                    data: {
                        deviceId: input.deviceId,
                        mobileDeviceId: device.id,
                        idempotencyKey: payload.idempotencyKey,
                        operation: payload.operation,
                        payload: payload as any,
                        clientTimestamp: new Date(
                            payload.clientTimestamp ||
                                payload.timestamp ||
                                Date.now(),
                        ),
                        status: 'PENDING',
                    },
                })
            } else if (
                queueRow.status === 'ACCEPTED' ||
                queueRow.status === 'CONFLICT' ||
                queueRow.status === 'REJECTED'
            ) {
                results.push({
                    idempotencyKey: payload.idempotencyKey,
                    status: queueRow.status,
                    conflictCode: queueRow.conflictCode,
                    errorMessage: queueRow.errorMessage,
                    serverEventId: queueRow.serverEventId,
                    duplicate: true,
                })
                continue
            }

            await this.prisma.mmMobileSyncQueue.update({
                where: { id: queueRow.id },
                data: {
                    status: 'SYNCING',
                    attempts: { increment: 1 },
                },
            })

            try {
                const result = await this.execute(payload.operation as any, {
                    ...payload,
                    offlineQueued: true,
                    syncQueueId: queueRow.id,
                    mobileDeviceId: device.id,
                } as any)
                await this.prisma.mmMobileSyncQueue.update({
                    where: { id: queueRow.id },
                    data: {
                        status:
                            result.status === 'DUPLICATE'
                                ? 'ACCEPTED'
                                : result.status === 'CONFLICT'
                                  ? 'CONFLICT'
                                  : 'ACCEPTED',
                        serverEventId: result.id,
                        syncedAt: new Date(),
                        conflictCode: (result as any).conflictCode ?? null,
                    },
                })
                results.push({
                    idempotencyKey: payload.idempotencyKey,
                    status: 'ACCEPTED',
                    duplicate: !!(result as any).duplicate,
                    serverEventId: result.id,
                    result,
                })
            } catch (err: any) {
                const conflictCode = this.extractConflict(err)
                const message = Array.isArray(err?.response?.message)
                    ? err.response.message.join(', ')
                    : err?.message || 'Sync rejected'
                await this.prisma.mmMobileSyncQueue.update({
                    where: { id: queueRow.id },
                    data: {
                        status: conflictCode ? 'CONFLICT' : 'REJECTED',
                        conflictCode,
                        errorMessage: String(message).slice(0, 500),
                        syncedAt: new Date(),
                    },
                })
                results.push({
                    idempotencyKey: payload.idempotencyKey,
                    status: conflictCode ? 'CONFLICT' : 'REJECTED',
                    conflictCode,
                    errorMessage: String(message).slice(0, 500),
                })
            }
        }

        return {
            deviceId: input.deviceId,
            processed: results.length,
            results,
        }
    }

    private extractConflict(err: any): string | null {
        const text = String(
            err?.response?.message || err?.message || '',
        )
        const codes = [
            'STALE_TASK',
            'STOCK_CHANGED',
            'BIN_CHANGED',
            'ALREADY_POSTED',
            'DUPLICATE_SCAN',
            'UNAUTHORIZED_DEVICE',
            'EXPIRED_SESSION',
            'REVOKED_PERMISSION',
            'WRONG_BIN',
            'WRONG_BATCH',
            'WRONG_SERIAL',
            'WRONG_MATERIAL',
        ]
        for (const c of codes) {
            if (text.includes(c)) return c
        }
        if (err instanceof ConflictException) return 'CONFLICT'
        if (err instanceof ForbiddenException) return 'UNAUTHORIZED_DEVICE'
        if (err instanceof UnauthorizedException) return 'EXPIRED_SESSION'
        return null
    }

    private async execute(operation: string, input: MobileScanInput & {
        syncQueueId?: string
        mobileDeviceId?: string
    }) {
        if (!input.idempotencyKey) {
            throw new BadRequestException(
                'idempotencyKey is required for every mobile transaction',
            )
        }

        const device = await this.devices.assertAuthorized({
            deviceId: input.deviceId,
            companyId: input.companyId,
            userId: input.userId,
            sessionToken: input.sessionToken,
        })

        const dto: ScannerEventDto = {
            ...input,
            operation: operation as any,
            companyId: input.companyId || device.companyId,
        }

        try {
            const result = await this.events.processEvent(dto)
            // Attach device metadata on success path when possible
            if (result?.id && !(result as any).duplicate) {
                await this.prisma.mmScannerEvent.update({
                    where: { id: result.id },
                    data: {
                        mobileDeviceId: device.id,
                        offlineQueued: !!input.offlineQueued,
                        clientTimestamp: input.clientTimestamp
                            ? new Date(input.clientTimestamp)
                            : null,
                        syncQueueId: input.syncQueueId ?? null,
                    },
                }).catch(() => undefined)
            }
            return result
        } catch (err: any) {
            const conflictCode = this.extractConflict(err)
            if (conflictCode) {
                try {
                    await this.prisma.mmScannerEvent.create({
                        data: {
                            idempotencyKey: `${input.idempotencyKey}:conflict:${Date.now()}`,
                            deviceId: input.deviceId,
                            mobileDeviceId: device.id,
                            userId: input.userId,
                            operation,
                            barcode: input.barcode,
                            timestamp: new Date(input.timestamp),
                            clientTimestamp: input.clientTimestamp
                                ? new Date(input.clientTimestamp)
                                : null,
                            companyId: input.companyId || device.companyId,
                            status: 'CONFLICT',
                            conflictCode,
                            errorCode: conflictCode,
                            errorMessage: String(err?.message || '').slice(0, 500),
                            offlineQueued: !!input.offlineQueued,
                            syncQueueId: input.syncQueueId ?? null,
                            result: { conflictCode } as any,
                        },
                    })
                } catch {
                    /* ignore */
                }
            }
            throw err
        }
    }

    private async assertTaskFresh(
        operation: 'PUTAWAY' | 'PICKING' | 'COUNTING',
        input: MobileScanInput,
    ) {
        if (operation === 'PUTAWAY' && input.putawayTaskId) {
            const task = await this.prisma.wmPutawayTask.findUnique({
                where: { id: input.putawayTaskId },
            })
            if (!task) throw new BadRequestException('Putaway task not found')
            if (task.status === 'COMPLETED') {
                conflict('ALREADY_POSTED', 'Putaway task already completed')
            }
            if (task.status === 'CANCELLED') {
                conflict('STALE_TASK', 'Putaway task was cancelled')
            }
            if (
                input.expectedTaskUpdatedAt &&
                task.updatedAt.getTime() >
                    new Date(input.expectedTaskUpdatedAt).getTime()
            ) {
                conflict('STALE_TASK', 'Putaway task changed since download')
            }
            if (
                input.expectedSourceBinId &&
                task.recommendedBinId &&
                input.bin
            ) {
                const bin = await this.resolve.resolveBin(input.bin).catch(() => null)
                if (
                    bin &&
                    task.recommendedBinId &&
                    bin.id !== task.recommendedBinId &&
                    input.destinationBin == null
                ) {
                    // destination can differ; warn via BIN_CHANGED only when confirming wrong expected
                }
            }
        }

        if (operation === 'PICKING' && input.pickingTaskId) {
            const task = await this.prisma.wmPickingTask.findUnique({
                where: { id: input.pickingTaskId },
            })
            if (!task) throw new BadRequestException('Picking task not found')
            if (task.status === 'COMPLETED') {
                conflict('ALREADY_POSTED', 'Picking task already completed')
            }
            if (task.status === 'CANCELLED') {
                conflict('STALE_TASK', 'Picking task was cancelled')
            }
            if (
                input.expectedTaskUpdatedAt &&
                task.updatedAt.getTime() >
                    new Date(input.expectedTaskUpdatedAt).getTime()
            ) {
                conflict('STALE_TASK', 'Picking task changed since download')
            }
            if (input.expectedSourceBinId && input.bin) {
                const bin = await this.resolve.resolveBin(input.bin)
                if (bin.id !== input.expectedSourceBinId) {
                    conflict(
                        'BIN_CHANGED',
                        'Scanned bin does not match cached source bin',
                    )
                }
                if (bin.id !== task.sourceBinId) {
                    conflict(
                        'BIN_CHANGED',
                        'Task source bin changed on server',
                    )
                }
            }
        }

        if (operation === 'COUNTING' && input.countLineId) {
            const line = await this.prisma.mmInventoryCountLine.findUnique({
                where: { id: input.countLineId },
            })
            if (!line) throw new BadRequestException('Count line not found')
            if (line.status === 'COUNTED' || line.status === 'ADJUSTED' || line.status === 'APPROVED') {
                conflict('ALREADY_POSTED', 'Count line already submitted')
            }
        }
    }
}
