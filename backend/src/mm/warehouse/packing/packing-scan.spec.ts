import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../../../prisma/prisma.service'
import { PackingService } from './packing.service'

/**
 * Scanner-first packing: over-scan blocking, wrong-item rejection, correct
 * In Progress / Complete status, manual adjustments, completion gating and
 * the scan audit trail.
 */
function setup() {
    const scanLogs: Array<Record<string, unknown>> = []
    const items: Array<Record<string, unknown>> = [
        {
            id: 'item-1',
            packageId: 'pkg-1',
            materialId: 'm-1',
            material: {
                materialCode: 'MAT-000008',
                materialName: 'KIRKLAND SIGNATURE FISH OIL 400',
                batchManaged: false,
                serialManaged: false,
            },
            expectedQty: new Decimal(10),
            scannedQty: new Decimal(0),
            batchId: null,
            serialId: null,
            packedById: null,
            packedByName: null,
            status: 'PENDING',
        },
        {
            id: 'item-2',
            packageId: 'pkg-1',
            materialId: 'm-2',
            material: {
                materialCode: 'MAT-000009',
                materialName: 'OTHER ITEM',
                batchManaged: false,
                serialManaged: false,
            },
            expectedQty: new Decimal(5),
            scannedQty: new Decimal(0),
            batchId: null,
            serialId: null,
            packedById: null,
            packedByName: null,
            status: 'PENDING',
        },
    ]

    const prisma: any = {
        $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
        wmPackage: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'pkg-1',
                packageNumber: 'PKG-000010',
                status: 'OPEN',
                salesOrderId: 'so-1',
                packingSessionId: null,
                items,
                scanLogs: [],
                shipment: null,
                reservation: null,
                pickingTask: null,
                warehouse: null,
            }),
            update: jest.fn(async ({ data }: any) => ({
                ...(await prisma.wmPackage.findUnique()),
                ...data,
            })),
        },
        wmPackageItem: {
            findFirst: jest.fn(async ({ where }: any) => {
                if (where.id) {
                    return (
                        items.find(
                            (i) => i.id === where.id && i.packageId === where.packageId,
                        ) ?? null
                    )
                }
                const match = items.find(
                    (i) =>
                        i.materialId === where.materialId &&
                        i.packageId === where.packageId,
                )
                return match ?? null
            }),
            findMany: jest.fn(async () => items),
            update: jest.fn(async ({ where, data }: any) => {
                const item = items.find((i) => i.id === where.id)
                Object.assign(item!, data)
                return item
            }),
        },
        wmPackageScanLog: {
            findUnique: jest.fn(async ({ where }: any) => {
                const found = scanLogs.find(
                    (l) => l.idempotencyKey && l.idempotencyKey === where.idempotencyKey,
                )
                return found ?? null
            }),
            create: jest.fn(async ({ data }: any) => {
                const log = { id: `log-${scanLogs.length + 1}`, ...data }
                scanLogs.push(log)
                return log
            }),
            createMany: jest.fn(async ({ data }: any) => {
                for (const entry of data) {
                    scanLogs.push({
                        id: `log-${scanLogs.length + 1}`,
                        ...entry,
                    })
                }
                return { count: data.length }
            }),
            findMany: jest.fn(async () => [...scanLogs].reverse()),
        },
        mmMaterial: {
            findFirst: jest.fn(async ({ where }: any) => {
                const code = where.OR?.find((o: any) => o.materialCode)?.materialCode
                if (code === 'MAT-000008') return { id: 'm-1' }
                if (code === 'MAT-000009') return { id: 'm-2' }
                if (code === 'MAT-NOPE') return null
                return { id: 'm-1' }
            }),
        },
        user: {
            findUnique: jest.fn().mockResolvedValue({
                firstName: 'Kurt',
                lastName: 'J.',
                userName: 'kurt',
            }),
        },
        sdSalesOrderLine: {
            findFirst: jest.fn().mockResolvedValue({
                productId: 'product-1',
                variantId: null,
            }),
        },
    }

    const service = new PackingService(
        prisma as unknown as PrismaService,
        {} as never,
    )
    return { prisma, service, items, scanLogs }
}

const user = { id: 'user-1', userName: 'kurt' }

describe('PackingService scanner-first scanning', () => {
    it('1. Expected 10 / scanned 3 reports IN_PROGRESS, not Complete', async () => {
        const { service } = setup()
        const result = await service.scanItem(
            'pkg-1',
            { materialCode: 'MAT-000008', quantity: 3 },
            user,
        )
        expect(result.totalExpected).toBe(15)
        expect(result.totalScanned).toBe(3)
        expect(result.remaining).toBe(12)
        expect(result.line?.status).toBe('IN_PROGRESS')
        expect(result.line?.scannedQuantity).toBe(3)
        expect(result.allScanned).toBe(false)
    })

    it('2. Scanning to the expected quantity reports COMPLETE', async () => {
        const { service } = setup()
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 10 }, user)
        const result = await service.scanItem('pkg-1', { materialCode: 'MAT-000009', quantity: 5 }, user)
        expect(result.totalScanned).toBe(15)
        expect(result.remaining).toBe(0)
        expect(result.allScanned).toBe(true)
        expect(result.line?.status).toBe('COMPLETE')
    })

    it('3. Over-scanning is blocked', async () => {
        const { service } = setup()
        await expect(
            service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 11 }, user),
        ).rejects.toThrow(BadRequestException)
        await expect(
            service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 11 }, user),
        ).rejects.toThrow(/Overpacked/)
    })

    it('4. Scanning a material that is not in the package is blocked', async () => {
        const { service } = setup()
        await expect(
            service.scanItem('pkg-1', { materialCode: 'MAT-NOPE', quantity: 1 }, user),
        ).rejects.toThrow(/Unknown material code or barcode/)
    })

    it('4b. Scanning a material of a different package item is blocked', async () => {
        const { service, prisma } = setup()
        prisma.mmMaterial.findFirst.mockImplementation(async ({ where }: any) => {
            const code = where.OR?.find((o: any) => o.materialCode)?.materialCode
            return { id: code === 'MAT-OTHER' ? 'm-other' : 'm-1' }
        })
        await expect(
            service.scanItem('pkg-1', { materialCode: 'MAT-OTHER', quantity: 1 }, user),
        ).rejects.toThrow(/Wrong item/)
    })

    it('5. Manual +1 updates the scanned quantity and writes an audit entry', async () => {
        const { service, items, scanLogs } = setup()
        const result = await service.adjustItem(
            'pkg-1',
            'item-1',
            { action: 'add', quantity: 1 },
            user,
        )
        expect(result.line?.scannedQuantity).toBe(1)
        expect(items[0].scannedQty).toEqual(new Decimal(1))
        const log = scanLogs.find((l) => l.action === 'add')
        expect(log).toBeDefined()
        expect(log?.scannedQuantity).toEqual(new Decimal(1))
        expect(log?.scanType).toBe('manual')
        expect(log?.scannedByName).toBe('Kurt J.')
    })

    it('6. Complete Packing is blocked while quantities remain', async () => {
        const { service } = setup()
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 4 }, user)
        await expect(service.completePacking('pkg-1')).rejects.toThrow(
            /still to scan/,
        )
    })

    it('6b. Complete Packing succeeds when every quantity is scanned', async () => {
        const { service } = setup()
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 10 }, user)
        await service.scanItem('pkg-1', { materialCode: 'MAT-000009', quantity: 5 }, user)
        const result = await service.completePacking('pkg-1')
        expect(result.completed).toBe(true)
        expect(result.partial).toBe(false)
        expect(result.packageStatus).toBe('VERIFIED')
    })

    it('6c. Partial completion requires a reason and records the short pack', async () => {
        const { service, scanLogs } = setup()
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 3 }, user)
        await expect(service.completePacking('pkg-1', { allowPartial: true })).rejects.toThrow(
            /still to scan/,
        )
        const result = await service.completePacking('pkg-1', {
            allowPartial: true,
            reason: '2 units damaged',
        })
        expect(result.partial).toBe(true)
        expect(scanLogs.some((l) => String(l.reason).includes('SHORT_PACK'))).toBe(
            true,
        )
    })

    it('7. Every scan appends to the audit trail (recently scanned feed)', async () => {
        const { service, scanLogs } = setup()
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 2 }, user)
        await service.scanItem('pkg-1', { materialCode: 'MAT-000008', quantity: 1 }, user)
        expect(scanLogs).toHaveLength(2)
        const result = await service.recentScanLogs('pkg-1')
        expect(result).toHaveLength(2)
        // Newest first for the "Recently scanned" panel.
        expect(result[0].scannedQuantity).toEqual(new Decimal(1))
        // Sold product identity is snapshotted onto the log.
        expect(scanLogs[0].productId).toBe('product-1')
        expect(scanLogs[0].scannedByUserId).toBe('user-1')
        expect(scanLogs[0].salesOrderId).toBe('so-1')
    })

    it('8. Replayed idempotency key does not double-count', async () => {
        const { service, scanLogs } = setup()
        await service.scanItem(
            'pkg-1',
            { materialCode: 'MAT-000008', quantity: 3, idempotencyKey: 'scan-1' },
            user,
        )
        await service.scanItem(
            'pkg-1',
            { materialCode: 'MAT-000008', quantity: 3, idempotencyKey: 'scan-1' },
            user,
        )
        expect(scanLogs).toHaveLength(1)
        const result = await service.recentScanLogs('pkg-1')
        expect(result[0].scannedQuantity).toEqual(new Decimal(3))
    })
})
