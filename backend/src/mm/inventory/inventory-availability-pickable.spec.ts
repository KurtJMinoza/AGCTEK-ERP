/**
 * Pickable-stock availability: warehouse-level (bin-less) balances are on-hand
 * but NOT sellable — allocation has no bin to pick from, so commercial
 * availability must exclude them or the storefront promises un-fulfillable
 * stock.
 */
import { InventoryAvailabilityService } from './inventory-availability.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('InventoryAvailabilityService pickable stock', () => {
    let service: InventoryAvailabilityService
    let findMany: jest.Mock
    /** Balance rows the fake prisma returns for a query. */
    let balanceStore: Array<Record<string, unknown>>

    const binBalance = {
        storageBinId: 'bin-1',
        stockStatus: 'UNRESTRICTED',
        quantity: 10,
        reservedQuantity: 0,
    }
    const warehouseLevelBalance = {
        storageBinId: null,
        stockStatus: 'UNRESTRICTED',
        quantity: 100,
        reservedQuantity: 0,
    }

    beforeEach(() => {
        balanceStore = [binBalance, warehouseLevelBalance]
        findMany = jest.fn((args?: { where?: { storageBinId?: unknown } }) => {
            // Honour the storageBinId filter the way Prisma would.
            const filter = args?.where?.storageBinId
            const rows =
                filter && typeof filter === 'object' && 'not' in filter
                    ? balanceStore.filter((b) => b.storageBinId !== null)
                    : balanceStore
            return Promise.resolve(rows)
        })
        service = new InventoryAvailabilityService({
            mmInventoryBalance: { findMany },
        } as unknown as PrismaService)
    })

    it('getPickableMaterialTotals excludes warehouse-level (bin-less) stock', async () => {
        const totals = await service.getPickableMaterialTotals('co-1', 'mat-1')

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ storageBinId: { not: null } }),
            }),
        )
        // 100 units sit at warehouse level with no bin — only the 10 in a bin
        // may be promised to the storefront.
        expect(totals).toEqual({
            onHandQty: 10,
            reservedQty: 0,
            availableQty: 10,
        })
    })

    it('getCommercialMaterialTotals is pickable-only', async () => {
        balanceStore = [warehouseLevelBalance]

        const totals = await service.getCommercialMaterialTotals('co-1', 'mat-1')

        expect(totals.availableQty).toBe(0)
    })

    it('getCompanyMaterialTotals still reports total on-hand for internal reports', async () => {
        findMany.mockResolvedValue([binBalance, warehouseLevelBalance])

        const totals = await service.getCompanyMaterialTotals('co-1', 'mat-1')

        expect(totals.onHandQty).toBe(110)
        expect(totals.availableQty).toBe(110)
    })

    it('reservations reduce pickable availability', async () => {
        findMany.mockResolvedValue([
            { ...binBalance, reservedQuantity: 4 },
        ])

        const totals = await service.getPickableMaterialTotals('co-1', 'mat-1')

        expect(totals.availableQty).toBe(6)
        expect(totals.reservedQty).toBe(4)
    })

    it('getPickableAvailabilityBatch groups per warehouse+material pair', async () => {
        findMany.mockResolvedValue([
            {
                storageBinId: 'bin-1',
                warehouseId: 'wh-1',
                materialId: 'mat-1',
                stockStatus: 'UNRESTRICTED',
                quantity: 5,
                reservedQuantity: 0,
                availableQuantity: 5,
            },
            {
                storageBinId: 'bin-1',
                warehouseId: 'wh-2',
                materialId: 'mat-1',
                stockStatus: 'UNRESTRICTED',
                quantity: 7,
                reservedQuantity: 0,
                availableQuantity: 7,
            },
        ])

        const batch = await service.getPickableAvailabilityBatch('co-1', [
            { warehouseId: 'wh-1', materialId: 'mat-1' },
            { warehouseId: 'wh-2', materialId: 'mat-1' },
            { warehouseId: 'wh-3', materialId: 'mat-1' },
        ])

        expect(batch.get('wh-1:mat-1')?.available).toBe(5)
        expect(batch.get('wh-2:mat-1')?.available).toBe(7)
        expect(batch.get('wh-3:mat-1')?.available).toBe(0)
    })
})
