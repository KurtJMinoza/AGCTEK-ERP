/**
 * Phase 11: Barcode/RFID + Mobile Warehouse Execution scenarios
 * Scanner is an execution channel only — never posts inventory directly.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common'
import { BarcodeResolveService } from './barcode-resolve.service'
import { MobileDeviceService } from './mobile-device.service'
import { MobileExecutionService } from './mobile-execution.service'
import { ScannerEventService } from './scanner-event.service'

function mockPrisma(overrides: any = {}) {
    const devices: any[] = []
    const syncQueue: any[] = []
    const events: any[] = []

    return {
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
        mmBarcode: { findFirst: jest.fn().mockResolvedValue(null) },
        mmMaterial: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn().mockResolvedValue({
                id: 'mat-1',
                batchManaged: false,
                serialManaged: false,
                baseUomId: 'uom-1',
            }),
        },
        mmSupplierMaterial: { findFirst: jest.fn().mockResolvedValue(null) },
        warehouse: { findFirst: jest.fn().mockResolvedValue(null) },
        wmStorageBin: { findFirst: jest.fn().mockResolvedValue(null) },
        mmBatch: { findFirst: jest.fn().mockResolvedValue(null) },
        mmSerialNumber: { findFirst: jest.fn().mockResolvedValue(null) },
        mmPurchaseOrder: { findFirst: jest.fn().mockResolvedValue(null) },
        mmExpectedReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
        mmExpectedReceiptLine: { findUnique: jest.fn() },
        wmPickingTask: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn(),
        },
        wmPutawayTask: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn(),
        },
        wmWarehouseTask: { findFirst: jest.fn().mockResolvedValue(null) },
        mmStockTransferOrder: { findFirst: jest.fn().mockResolvedValue(null) },
        wmPackage: { findFirst: jest.fn().mockResolvedValue(null) },
        mmInventoryCount: { findFirst: jest.fn().mockResolvedValue(null) },
        mmInventoryCountLine: {
            findFirst: jest.fn().mockResolvedValue(null),
            findUnique: jest.fn(),
        },
        mmScannerEvent: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(({ data }) => {
                const row = { id: `ev-${events.length + 1}`, ...data }
                events.push(row)
                return Promise.resolve(row)
            }),
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        mmMobileDevice: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
                const d = devices.find(
                    (x) =>
                        x.deviceCode === where.deviceCode || x.id === where.id,
                )
                return Promise.resolve(d ?? null)
            }),
            create: jest.fn().mockImplementation(({ data }) => {
                const row = {
                    id: `dev-${devices.length + 1}`,
                    ...data,
                    sessionExpiresAt:
                        data.sessionExpiresAt ??
                        new Date(Date.now() + 3600_000),
                }
                devices.push(row)
                return Promise.resolve(row)
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
                const idx = devices.findIndex(
                    (x) => x.id === where.id || x.deviceCode === where.deviceCode,
                )
                if (idx >= 0) {
                    devices[idx] = { ...devices[idx], ...data }
                    return Promise.resolve(devices[idx])
                }
                return Promise.resolve({ id: where.id, ...data })
            }),
        },
        mmMobileSyncQueue: {
            findUnique: jest.fn().mockImplementation(({ where }) =>
                Promise.resolve(
                    syncQueue.find((x) => x.idempotencyKey === where.idempotencyKey) ??
                        null,
                ),
            ),
            create: jest.fn().mockImplementation(({ data }) => {
                const row = { id: `q-${syncQueue.length + 1}`, ...data }
                syncQueue.push(row)
                return Promise.resolve(row)
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
                const idx = syncQueue.findIndex((x) => x.id === where.id)
                if (idx >= 0) {
                    const next = { ...syncQueue[idx] }
                    if (data.attempts?.increment) {
                        next.attempts = (next.attempts || 0) + data.attempts.increment
                    }
                    Object.assign(next, { ...data, attempts: next.attempts })
                    delete (next as any).attempts?.increment
                    syncQueue[idx] = { ...syncQueue[idx], ...data, attempts: next.attempts }
                    return Promise.resolve(syncQueue[idx])
                }
                return Promise.resolve({ id: where.id, ...data })
            }),
        },
        __devices: devices,
        __syncQueue: syncQueue,
        __events: events,
        ...overrides,
    }
}

describe('Phase 11 Mobile Warehouse Execution', () => {
    it('1) valid scan resolve returns entityType + allowedActions', async () => {
        const prisma = mockPrisma({
            mmBarcode: {
                findFirst: jest.fn().mockResolvedValue({
                    materialId: 'mat-1',
                    material: {
                        id: 'mat-1',
                        materialCode: 'M1',
                        materialName: 'Widget',
                        batchManaged: false,
                        serialManaged: false,
                        baseUomId: 'uom-1',
                    },
                }),
            },
        })
        const svc = new BarcodeResolveService(prisma as any)
        const hit = await svc.resolve('BC-OK')
        expect(hit.entityType).toBe('MATERIAL')
        expect(hit.entityId).toBe('mat-1')
        expect(hit.allowedActions).toContain('RECEIVE')
        expect(hit.allowedActions).toContain('PICK')
    })

    it('2) wrong barcode → INVALID_BARCODE', async () => {
        const svc = new BarcodeResolveService(mockPrisma() as any)
        await expect(svc.resolve('NOPE')).rejects.toThrow(/INVALID_BARCODE/)
    })

    it('3) wrong bin conflict on picking', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.wmPickingTask.findUnique.mockResolvedValue({
            id: 'pick-1',
            status: 'ASSIGNED',
            sourceBinId: 'bin-ok',
            updatedAt: new Date(),
        })
        prisma.wmStorageBin.findFirst.mockResolvedValue({
            id: 'bin-wrong',
            code: 'WRONG',
        })
        const events = {
            processEvent: jest.fn(),
        }
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            events as any,
            new BarcodeResolveService(prisma as any),
        )
        await expect(
            mobile.pickingScan({
                deviceId: 'd1',
                userId: 'user-1',
                companyId: 'c1',
                operation: 'PICKING',
                barcode: 'M',
                timestamp: new Date().toISOString(),
                quantity: 1,
                bin: 'WRONG',
                idempotencyKey: 'k-bin',
                pickingTaskId: 'pick-1',
                expectedSourceBinId: 'bin-ok',
            } as any),
        ).rejects.toThrow(/BIN_CHANGED/)
        expect(events.processEvent).not.toHaveBeenCalled()
    })

    it('4) wrong batch still enforced by scanner channel', async () => {
        // Delegates to ScannerEventService which rejects WRONG_BATCH
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.wmPickingTask.findUnique.mockResolvedValue({
            id: 'pick-1',
            status: 'ASSIGNED',
            sourceBinId: 'bin-ok',
            updatedAt: new Date(),
        })
        const events = {
            processEvent: jest
                .fn()
                .mockRejectedValue(
                    new BadRequestException(
                        'WRONG_BATCH: Scanned batch does not match task',
                    ),
                ),
        }
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            events as any,
            new BarcodeResolveService(prisma as any),
        )
        await expect(
            mobile.pickingScan({
                deviceId: 'd1',
                userId: 'user-1',
                companyId: 'c1',
                operation: 'PICKING',
                barcode: 'M',
                timestamp: new Date().toISOString(),
                quantity: 1,
                idempotencyKey: 'k-batch',
                pickingTaskId: 'pick-1',
            } as any),
        ).rejects.toThrow(/WRONG_BATCH/)
    })

    it('5) wrong serial still enforced by scanner channel', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.wmPickingTask.findUnique.mockResolvedValue({
            id: 'pick-1',
            status: 'ASSIGNED',
            sourceBinId: 'bin-ok',
            updatedAt: new Date(),
        })
        const events = {
            processEvent: jest
                .fn()
                .mockRejectedValue(
                    new BadRequestException(
                        'WRONG_SERIAL: Scanned serial does not match task',
                    ),
                ),
        }
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            events as any,
            new BarcodeResolveService(prisma as any),
        )
        await expect(
            mobile.pickingScan({
                deviceId: 'd1',
                userId: 'user-1',
                companyId: 'c1',
                operation: 'PICKING',
                barcode: 'M',
                timestamp: new Date().toISOString(),
                quantity: 1,
                idempotencyKey: 'k-ser',
                pickingTaskId: 'pick-1',
            } as any),
        ).rejects.toThrow(/WRONG_SERIAL/)
    })

    it('6) duplicate scan → DUPLICATE without re-post', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        const processEvent = jest.fn().mockResolvedValue({
            id: 'ev-1',
            status: 'DUPLICATE',
            duplicate: true,
        })
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            { processEvent } as any,
            new BarcodeResolveService(prisma as any),
        )
        prisma.wmPutawayTask.findUnique.mockResolvedValue({
            id: 'pa-1',
            status: 'PENDING',
            updatedAt: new Date(),
        })
        const res = await mobile.putawayScan({
            deviceId: 'd1',
            userId: 'user-1',
            companyId: 'c1',
            operation: 'PUTAWAY',
            barcode: 'BIN',
            timestamp: new Date().toISOString(),
            quantity: 1,
            idempotencyKey: 'dup-1',
            putawayTaskId: 'pa-1',
            bin: 'B1',
        } as any)
        expect(res.duplicate).toBe(true)
        expect(processEvent).toHaveBeenCalledTimes(1)
    })

    it('7) offline scan enqueues then sync validates server-side', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        const processEvent = jest.fn().mockResolvedValue({
            id: 'ev-sync-1',
            status: 'SUCCESS',
        })
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            { processEvent } as any,
            new BarcodeResolveService(prisma as any),
        )
        const out = await mobile.sync({
            deviceId: 'd1',
            companyId: 'c1',
            userId: 'user-1',
            events: [
                {
                    deviceId: 'd1',
                    userId: 'user-1',
                    operation: 'COUNTING',
                    barcode: 'MANUAL',
                    timestamp: new Date().toISOString(),
                    quantity: 3,
                    idempotencyKey: 'off-1',
                    countLineId: 'line-1',
                } as any,
            ],
        })
        expect(out.processed).toBe(1)
        expect(out.results[0].status).toBe('ACCEPTED')
        expect(processEvent).toHaveBeenCalled()
        expect(prisma.mmMobileSyncQueue.create).toHaveBeenCalled()
    })

    it('8) offline replay of accepted item is idempotent', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.__syncQueue.push({
            id: 'q-old',
            idempotencyKey: 'off-1',
            status: 'ACCEPTED',
            serverEventId: 'ev-1',
        })
        const processEvent = jest.fn()
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            { processEvent } as any,
            new BarcodeResolveService(prisma as any),
        )
        const out = await mobile.sync({
            deviceId: 'd1',
            companyId: 'c1',
            userId: 'user-1',
            events: [
                {
                    deviceId: 'd1',
                    userId: 'user-1',
                    operation: 'COUNTING',
                    barcode: 'MANUAL',
                    timestamp: new Date().toISOString(),
                    quantity: 3,
                    idempotencyKey: 'off-1',
                    countLineId: 'line-1',
                } as any,
            ],
        })
        expect(out.results[0].duplicate).toBe(true)
        expect(processEvent).not.toHaveBeenCalled()
    })

    it('9) conflict on stale / already posted task', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd1',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.wmPutawayTask.findUnique.mockResolvedValue({
            id: 'pa-1',
            status: 'COMPLETED',
            updatedAt: new Date(),
        })
        const mobile = new MobileExecutionService(
            prisma as any,
            devices,
            { processEvent: jest.fn() } as any,
            new BarcodeResolveService(prisma as any),
        )
        await expect(
            mobile.putawayScan({
                deviceId: 'd1',
                userId: 'user-1',
                companyId: 'c1',
                operation: 'PUTAWAY',
                barcode: 'BIN',
                timestamp: new Date().toISOString(),
                quantity: 1,
                idempotencyKey: 'stale-1',
                putawayTaskId: 'pa-1',
                bin: 'B1',
            } as any),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('10) unauthorized / revoked device', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        const created = await devices.register({
            deviceCode: 'd-bad',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.__devices[0].status = 'REVOKED'
        prisma.__devices[0].id = created.id
        await expect(
            devices.assertAuthorized({
                deviceId: 'd-bad',
                companyId: 'c1',
                requireRegistered: true,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('11) expired session', async () => {
        const prisma = mockPrisma()
        const devices = new MobileDeviceService(prisma as any)
        await devices.register({
            deviceCode: 'd-exp',
            companyId: 'c1',
            userId: 'user-1',
        })
        prisma.__devices[0].sessionExpiresAt = new Date(Date.now() - 1000)
        await expect(
            devices.assertAuthorized({
                deviceId: 'd-exp',
                companyId: 'c1',
                requireRegistered: true,
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('scanner module does not import InventoryPostingService', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require('path')
        for (const file of [
            'scanner-event.service.ts',
            'mobile-execution.service.ts',
            'barcode-resolve.service.ts',
        ]) {
            const src = fs.readFileSync(path.join(__dirname, file), 'utf8')
            expect(src).not.toMatch(/InventoryPostingService/)
            expect(src).not.toMatch(/mmInventoryTransaction\.create/)
        }
    })
})
