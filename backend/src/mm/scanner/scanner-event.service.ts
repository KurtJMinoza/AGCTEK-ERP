import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { BarcodeResolveService } from './barcode-resolve.service'
import { ReceivingService } from '../inbound/receiving.service'
import { PutawayService } from '../warehouse/putaway/putaway.service'
import { PickingService } from '../warehouse/picking/picking.service'
import { PackingService } from '../warehouse/packing/packing.service'
import { InventoryCountService } from '../inventory-control/inventory-count.service'
import { BinTransferService } from '../stock-ops/bin-transfer.service'
import { ScannerEventDto, ScannerEventsQueryDto } from './dto/scanner.dto'
import { Decimal } from '@prisma/client/runtime/library'

const DOC_HIT_TYPES = new Set([
    'PURCHASE_ORDER',
    'EXPECTED_RECEIPT',
    'PICKING_TASK',
    'INVENTORY_COUNT',
    'INVENTORY_COUNT_LINE',
])

function extractErrorCode(err: any, fallback = 'SCANNER_ERROR'): string {
    const raw =
        (Array.isArray(err?.response?.message)
            ? err.response.message.join(' ')
            : err?.response?.message) ||
        err?.message ||
        ''
    const text = String(raw)
    const m = text.match(
        /^(INVALID_BARCODE|WRONG_BIN|WRONG_BATCH|WRONG_SERIAL|WRONG_MATERIAL|DUPLICATE_IDEMPOTENCY_KEY|[A-Z_]+)\b/,
    )
    if (m) return m[1].slice(0, 64)
    if (/bin does not match/i.test(text)) return 'WRONG_BIN'
    if (/batch/i.test(text) && /match|required/i.test(text)) return 'WRONG_BATCH'
    if (/serial/i.test(text) && /match|required/i.test(text)) return 'WRONG_SERIAL'
    if (/not found for barcode|INVALID_BARCODE/i.test(text)) return 'INVALID_BARCODE'
    return String(err?.name || fallback).slice(0, 64)
}

function errorMessage(err: any): string {
    const message = err?.response?.message || err?.message || 'Scanner operation failed'
    return Array.isArray(message) ? message.join(', ') : String(message)
}

@Injectable()
export class ScannerEventService {
    constructor(
        private prisma: PrismaService,
        private resolveService: BarcodeResolveService,
        private receivingService: ReceivingService,
        private putawayService: PutawayService,
        private pickingService: PickingService,
        private packingService: PackingService,
        private countService: InventoryCountService,
        private binTransferService: BinTransferService,
    ) {}

    async processEvent(dto: ScannerEventDto) {
        const existing = await this.prisma.mmScannerEvent.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
        })
        if (existing) {
            return {
                ...existing,
                status: 'DUPLICATE',
                duplicate: true,
                result: existing.result,
            }
        }

        try {
            await this.validateUser(dto.userId)
            const result = await this.dispatch(dto)
            const event = await this.prisma.mmScannerEvent.create({
                data: {
                    idempotencyKey: dto.idempotencyKey,
                    deviceId: dto.deviceId,
                    userId: dto.userId,
                    operation: dto.operation,
                    barcode: dto.barcode,
                    timestamp: new Date(dto.timestamp),
                    quantity:
                        dto.quantity != null ? new Decimal(dto.quantity) : null,
                    companyId: result.companyId ?? dto.companyId ?? null,
                    warehouseId: result.warehouseId ?? null,
                    storageBinId: result.storageBinId ?? null,
                    materialId: result.materialId ?? null,
                    batchId: result.batchId ?? null,
                    serialNumberId: result.serialNumberId ?? null,
                    documentType: result.documentType ?? null,
                    documentId: result.documentId ?? null,
                    status: 'SUCCESS',
                    result: result.payload as any,
                },
            })
            return { ...event, duplicate: false }
        } catch (err: any) {
            const message = errorMessage(err)
            const errorCode = extractErrorCode(err)
            try {
                await this.prisma.mmScannerEvent.create({
                    data: {
                        idempotencyKey: `${dto.idempotencyKey}:fail:${Date.now()}`,
                        deviceId: dto.deviceId,
                        userId: dto.userId,
                        operation: dto.operation,
                        barcode: dto.barcode,
                        timestamp: new Date(dto.timestamp),
                        quantity:
                            dto.quantity != null
                                ? new Decimal(dto.quantity)
                                : null,
                        companyId: dto.companyId ?? null,
                        status: 'FAILED',
                        errorCode,
                        errorMessage: message.slice(0, 500),
                        result: { error: message, errorCode } as any,
                    },
                })
            } catch {
                /* ignore audit write failure */
            }
            throw err
        }
    }

    /**
     * Offline-ready batch ingest: process each event independently with its own idempotency key.
     */
    async processBatch(events: ScannerEventDto[]) {
        const results: any[] = []
        for (const ev of events) {
            try {
                const r = await this.processEvent(ev)
                results.push({
                    idempotencyKey: ev.idempotencyKey,
                    status: r.status,
                    duplicate: !!(r as any).duplicate,
                    id: r.id,
                    documentType: r.documentType ?? null,
                    documentId: r.documentId ?? null,
                    result: r.result,
                })
            } catch (err: any) {
                results.push({
                    idempotencyKey: ev.idempotencyKey,
                    status: 'FAILED',
                    errorCode: extractErrorCode(err),
                    errorMessage: errorMessage(err).slice(0, 500),
                })
            }
        }
        return { results, processed: results.length }
    }

    async listEvents(query: ScannerEventsQueryDto) {
        const where: any = {}
        if (query.companyId) where.companyId = query.companyId
        if (query.operation) where.operation = query.operation
        if (query.userId) where.userId = query.userId
        if (query.status) where.status = query.status

        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20

        const [data, total] = await Promise.all([
            this.prisma.mmScannerEvent.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.mmScannerEvent.count({ where }),
        ])

        return { data, total, page, pageSize }
    }

    private async validateUser(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } })
        if (!user) {
            throw new BadRequestException(
                'User not authorized: user_id not found',
            )
        }
        return user
    }

    private async dispatch(dto: ScannerEventDto): Promise<{
        companyId?: string | null
        warehouseId?: string | null
        storageBinId?: string | null
        materialId?: string | null
        batchId?: string | null
        serialNumberId?: string | null
        documentType?: string | null
        documentId?: string | null
        payload: any
    }> {
        switch (dto.operation) {
            case 'RECEIVING':
                return this.opReceiving(dto)
            case 'PUTAWAY':
                return this.opPutaway(dto)
            case 'PICKING':
                return this.opPicking(dto)
            case 'PACKING':
                return this.opPacking(dto)
            case 'COUNTING':
                return this.opCounting(dto)
            case 'TRANSFER':
                return this.opTransfer(dto)
            default:
                throw new BadRequestException(
                    `Unknown operation: ${dto.operation}`,
                )
        }
    }

    private async resolveMaterialContext(
        dto: ScannerEventDto,
        opts?: { requireMaterial?: boolean },
    ) {
        const requireMaterial = opts?.requireMaterial !== false
        let hit: any = null
        let materialId: string | undefined
        let batchId: string | undefined
        let serialNumberId: string | undefined
        let storageBinId: string | undefined

        if (dto.barcode && dto.barcode !== 'MANUAL') {
            try {
                hit = await this.resolveService.resolve(dto.barcode, dto.companyId)
                if (!DOC_HIT_TYPES.has(hit.type)) {
                    materialId = hit.materialId
                    batchId = hit.batchId
                    serialNumberId = hit.serialNumberId
                    storageBinId = hit.storageBinId
                } else {
                    // Document hit may still carry material/bin context (e.g. picking task)
                    materialId = hit.materialId
                    batchId = hit.batchId
                    serialNumberId = hit.serialNumberId
                    storageBinId = hit.storageBinId
                }
            } catch (e: any) {
                if (requireMaterial) throw e
            }
        }

        if (dto.bin) {
            const bin = await this.resolveService.resolveBin(dto.bin)
            storageBinId = bin.id
        }
        if (dto.batch) {
            const batch = await this.resolveService.resolveBatch(
                dto.batch,
                materialId,
            )
            batchId = batch.id
            if (!materialId) materialId = batch.materialId
        }
        if (dto.serial) {
            const serial = await this.resolveService.resolveSerial(
                dto.serial,
                materialId,
            )
            serialNumberId = serial.id
            if (!materialId) materialId = serial.materialId
        }

        let material = hit?.material
        if (materialId && !material) {
            material = (await this.prisma.mmMaterial.findUnique({
                where: { id: materialId },
                select: {
                    id: true,
                    materialCode: true,
                    materialName: true,
                    sku: true,
                    batchManaged: true,
                    serialManaged: true,
                    baseUomId: true,
                },
            })) as any
        }

        if (material?.batchManaged && !batchId) {
            throw new BadRequestException(
                'WRONG_BATCH: Batch required for batch-managed material',
            )
        }
        if (material?.serialManaged && !serialNumberId) {
            throw new BadRequestException(
                'WRONG_SERIAL: Serial required for serial-managed material',
            )
        }

        let warehouseId = dto.warehouseId
            ? (
                  await this.resolveService.resolveWarehouse(
                      dto.warehouseId,
                      dto.companyId,
                  )
              ).id
            : hit?.warehouseId

        return {
            hit,
            materialId,
            material,
            batchId,
            serialNumberId,
            storageBinId,
            warehouseId,
        }
    }

    private async opReceiving(dto: ScannerEventDto) {
        // Auto-fill ER from document barcode when ids omitted
        if (!dto.expectedReceiptId && dto.barcode) {
            try {
                const hit = await this.resolveService.resolve(
                    dto.barcode,
                    dto.companyId,
                )
                if (hit.type === 'EXPECTED_RECEIPT' && hit.expectedReceiptId) {
                    dto.expectedReceiptId = hit.expectedReceiptId
                } else if (hit.type === 'PURCHASE_ORDER' && hit.purchaseOrderId) {
                    const er = await this.prisma.mmExpectedReceipt.findFirst({
                        where: {
                            purchaseOrderId: hit.purchaseOrderId,
                            status: { in: ['OPEN', 'IN_PROGRESS'] },
                        },
                        orderBy: { createdAt: 'desc' },
                    })
                    if (er) dto.expectedReceiptId = er.id
                }
            } catch {
                /* continue with explicit ids */
            }
        }

        if (!dto.expectedReceiptId) {
            throw new BadRequestException(
                'expectedReceiptId is required for RECEIVING',
            )
        }
        if (!dto.expectedReceiptLineId) {
            throw new BadRequestException(
                'expectedReceiptLineId is required for RECEIVING',
            )
        }
        if (dto.quantity == null || dto.quantity <= 0) {
            throw new BadRequestException('quantity is required for RECEIVING')
        }

        const ctx = await this.resolveMaterialContext(dto, {
            requireMaterial: false,
        })
        const erLine = await this.prisma.mmExpectedReceiptLine.findUnique({
            where: { id: dto.expectedReceiptLineId },
        })
        if (!erLine) throw new NotFoundException('Expected receipt line not found')
        if (ctx.materialId && erLine.materialId !== ctx.materialId) {
            throw new BadRequestException(
                'WRONG_MATERIAL: Scanned material does not match expected receipt line',
            )
        }

        const materialId = ctx.materialId ?? erLine.materialId
        const material = await this.prisma.mmMaterial.findUnique({
            where: { id: materialId },
            select: { batchManaged: true, serialManaged: true },
        })
        if (material?.batchManaged && !ctx.batchId) {
            throw new BadRequestException(
                'WRONG_BATCH: Batch required for batch-managed material',
            )
        }
        if (material?.serialManaged && !ctx.serialNumberId) {
            throw new BadRequestException(
                'WRONG_SERIAL: Serial required for serial-managed material',
            )
        }

        const gr = await this.receivingService.receive({
            expectedReceiptId: dto.expectedReceiptId,
            receiverId: dto.userId,
            createdBy: dto.userId,
            lines: [
                {
                    expectedReceiptLineId: dto.expectedReceiptLineId,
                    receivedQuantity: dto.quantity,
                    batchId: ctx.batchId,
                    serialNumberId: ctx.serialNumberId,
                    storageBinId: ctx.storageBinId,
                    barcode: dto.barcode,
                },
            ],
        })

        return {
            companyId: gr.companyId,
            warehouseId: gr.warehouseId,
            materialId,
            batchId: ctx.batchId,
            serialNumberId: ctx.serialNumberId,
            storageBinId: ctx.storageBinId,
            documentType: 'GOODS_RECEIPT',
            documentId: gr.id,
            payload: {
                goodsReceiptId: gr.id,
                documentNumber: gr.documentNumber,
                status: gr.status,
            },
        }
    }

    private async opPutaway(dto: ScannerEventDto) {
        if (!dto.putawayTaskId) {
            throw new BadRequestException(
                'putawayTaskId is required for PUTAWAY',
            )
        }
        if (!dto.bin && !dto.barcode) {
            throw new BadRequestException(
                'bin (destination) is required for PUTAWAY',
            )
        }
        if (dto.quantity == null || dto.quantity <= 0) {
            throw new BadRequestException('quantity is required for PUTAWAY')
        }

        let actualBinId: string
        if (dto.bin) {
            actualBinId = (await this.resolveService.resolveBin(dto.bin)).id
        } else {
            const hit = await this.resolveService.resolve(dto.barcode)
            if (hit.type !== 'STORAGE_BIN' || !hit.storageBinId) {
                throw new BadRequestException(
                    'INVALID_BARCODE: Scan a storage bin barcode for PUTAWAY destination',
                )
            }
            actualBinId = hit.storageBinId
        }

        const task = await this.putawayService.confirm(dto.putawayTaskId, {
            actualBinId,
            quantity: dto.quantity,
            idempotencyKey: dto.idempotencyKey,
        })

        return {
            companyId: task.companyId,
            warehouseId: task.warehouseId,
            materialId: task.materialId,
            storageBinId: actualBinId,
            batchId: task.batchId,
            serialNumberId: task.serialId,
            documentType: 'PUTAWAY',
            documentId: task.id,
            payload: { putawayTaskId: task.id, status: task.status },
        }
    }

    private async opPicking(dto: ScannerEventDto) {
        // Auto-select task from document barcode
        if (!dto.pickingTaskId && dto.barcode) {
            try {
                const hit = await this.resolveService.resolve(
                    dto.barcode,
                    dto.companyId,
                )
                if (hit.type === 'PICKING_TASK' && hit.pickingTaskId) {
                    dto.pickingTaskId = hit.pickingTaskId
                }
            } catch {
                /* ignore */
            }
        }

        if (!dto.pickingTaskId) {
            throw new BadRequestException(
                'pickingTaskId is required for PICKING',
            )
        }
        if (dto.quantity == null || dto.quantity <= 0) {
            throw new BadRequestException('quantity is required for PICKING')
        }

        const taskPreview = await this.prisma.wmPickingTask.findUnique({
            where: { id: dto.pickingTaskId },
            select: {
                id: true,
                sourceBinId: true,
                materialId: true,
                batchId: true,
                serialId: true,
            },
        })
        if (!taskPreview) throw new NotFoundException('Picking task not found')

        const ctx = await this.resolveMaterialContext(dto, {
            requireMaterial: true,
        })
        if (!ctx.materialId) {
            throw new BadRequestException(
                'INVALID_BARCODE: Could not resolve material from barcode',
            )
        }

        const scannedBinId =
            ctx.storageBinId ||
            (dto.bin
                ? (await this.resolveService.resolveBin(dto.bin)).id
                : undefined)
        if (!scannedBinId) {
            throw new BadRequestException(
                'WRONG_BIN: bin is required for PICKING (scanned source bin)',
            )
        }
        if (scannedBinId !== taskPreview.sourceBinId) {
            throw new BadRequestException(
                'WRONG_BIN: Scanned bin does not match source bin',
            )
        }
        if (
            taskPreview.batchId &&
            ctx.batchId &&
            ctx.batchId !== taskPreview.batchId
        ) {
            throw new BadRequestException(
                'WRONG_BATCH: Scanned batch does not match task',
            )
        }
        if (
            taskPreview.serialId &&
            ctx.serialNumberId &&
            ctx.serialNumberId !== taskPreview.serialId
        ) {
            throw new BadRequestException(
                'WRONG_SERIAL: Scanned serial does not match task',
            )
        }

        const task = await this.pickingService.confirmPick(dto.pickingTaskId, {
            scannedBinId,
            scannedMaterialId: ctx.materialId,
            pickedQty: dto.quantity,
            scannedBatchId: ctx.batchId,
            scannedSerialId: ctx.serialNumberId,
            idempotencyKey: dto.idempotencyKey,
        })

        return {
            companyId: (task as any).companyId,
            warehouseId: (task as any).warehouseId,
            materialId: ctx.materialId,
            storageBinId: scannedBinId,
            batchId: ctx.batchId,
            serialNumberId: ctx.serialNumberId,
            documentType: 'PICKING',
            documentId: task.id,
            payload: { pickingTaskId: task.id, status: task.status },
        }
    }

    private async opPacking(dto: ScannerEventDto) {
        if (!dto.packageId) {
            throw new BadRequestException('packageId is required for PACKING')
        }
        const ctx = await this.resolveMaterialContext(dto)
        if (!ctx.materialId) {
            throw new BadRequestException(
                'INVALID_BARCODE: Could not resolve material from barcode',
            )
        }
        const qty = dto.quantity ?? 1

        const item = await this.packingService.scanItem(
            dto.packageId,
            ctx.materialId,
            qty,
            ctx.batchId,
            ctx.serialNumberId,
            dto.idempotencyKey,
        )

        return {
            materialId: ctx.materialId,
            batchId: ctx.batchId,
            serialNumberId: ctx.serialNumberId,
            documentType: 'PACKAGE',
            documentId: dto.packageId,
            payload: { packageId: dto.packageId, item },
        }
    }

    private async opCounting(dto: ScannerEventDto) {
        // Auto-fill count line from document barcode
        if (!dto.countLineId && dto.barcode) {
            try {
                const hit = await this.resolveService.resolve(
                    dto.barcode,
                    dto.companyId,
                )
                if (hit.type === 'INVENTORY_COUNT_LINE' && hit.countLineId) {
                    dto.countLineId = hit.countLineId
                }
            } catch {
                /* ignore */
            }
        }

        if (!dto.countLineId) {
            throw new BadRequestException(
                'countLineId is required for COUNTING',
            )
        }
        if (dto.quantity == null) {
            throw new BadRequestException('quantity is required for COUNTING')
        }

        const line = await this.prisma.mmInventoryCountLine.findUnique({
            where: { id: dto.countLineId },
        })
        if (!line) throw new NotFoundException('Count line not found')

        if (dto.bin || dto.barcode) {
            try {
                const ctx = await this.resolveMaterialContext(dto, {
                    requireMaterial: false,
                })
                if (ctx.materialId && line.materialId !== ctx.materialId) {
                    throw new BadRequestException(
                        'WRONG_MATERIAL: Scanned material does not match count line',
                    )
                }
                if (
                    line.storageBinId &&
                    ctx.storageBinId &&
                    line.storageBinId !== ctx.storageBinId
                ) {
                    throw new BadRequestException(
                        'WRONG_BIN: Scanned bin does not match count line',
                    )
                }
            } catch (e: any) {
                if (e instanceof BadRequestException) throw e
            }
        }

        const updated = await this.countService.blindCount(dto.countLineId, {
            countedQuantity: dto.quantity,
            countedBy: dto.userId,
            idempotencyKey: dto.idempotencyKey,
        })

        return {
            materialId: updated.materialId,
            storageBinId: line.storageBinId,
            documentType: 'INVENTORY_COUNT_LINE',
            documentId: updated.id,
            payload: {
                countLineId: updated.id,
                countedQuantity: Number(updated.countedQuantity),
            },
        }
    }

    private async opTransfer(dto: ScannerEventDto) {
        if (dto.quantity == null || dto.quantity <= 0) {
            throw new BadRequestException('quantity is required for TRANSFER')
        }
        if (!dto.bin) {
            throw new BadRequestException(
                'bin (source) is required for TRANSFER',
            )
        }
        if (!dto.destinationBin) {
            throw new BadRequestException(
                'destinationBin is required for TRANSFER',
            )
        }
        if (!dto.warehouseId) {
            throw new BadRequestException(
                'warehouseId is required for TRANSFER',
            )
        }

        const ctx = await this.resolveMaterialContext(dto)
        if (!ctx.materialId || !ctx.material) {
            throw new BadRequestException(
                'INVALID_BARCODE: Could not resolve material from barcode',
            )
        }

        const sourceBin = await this.resolveService.resolveBin(dto.bin)
        const destBin = await this.resolveService.resolveBin(dto.destinationBin)
        const warehouse = await this.resolveService.resolveWarehouse(
            dto.warehouseId,
            dto.companyId,
        )

        const uomId = dto.uomId || ctx.material.baseUomId
        if (!uomId) throw new BadRequestException('uomId is required')

        const doc = await this.binTransferService.create({
            companyId: warehouse.companyId,
            warehouseId: warehouse.id,
            postingDate: new Date().toISOString().slice(0, 10),
            createdBy: dto.userId,
            remarks: `Scanner transfer ${dto.idempotencyKey}`,
            lines: [
                {
                    materialId: ctx.materialId,
                    quantity: dto.quantity,
                    uomId,
                    sourceBinId: sourceBin.id,
                    destinationBinId: destBin.id,
                    batchId: ctx.batchId,
                    serialNumberId: ctx.serialNumberId,
                },
            ],
        })

        const posted = await this.binTransferService.post(
            doc.id,
            dto.idempotencyKey,
        )

        return {
            companyId: warehouse.companyId,
            warehouseId: warehouse.id,
            materialId: ctx.materialId,
            storageBinId: destBin.id,
            batchId: ctx.batchId,
            serialNumberId: ctx.serialNumberId,
            documentType: 'BIN_TRANSFER',
            documentId: posted.id,
            payload: {
                binTransferId: posted.id,
                documentNumber: posted.documentNumber,
                status: posted.status,
            },
        }
    }
}
