import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { SdMaterialReferenceService } from './sd-material-reference.service'

const params = (overrides: Record<string, unknown> = {}) => ({
    reorderPoint: new Decimal(20),
    safetyStock: new Decimal(10),
    reorderQuantity: new Decimal(0),
    minimumOrderQuantity: new Decimal(0),
    minStock: new Decimal(0),
    maxStock: new Decimal(100),
    lotSize: new Decimal(0),
    reviewPeriodDays: 0,
    planningHorizonDays: null,
    planningStrategy: 'REORDER_POINT',
    procurementType: 'BUY',
    leadTimeDays: 0,
    source: 'MATERIAL' as const,
    scope: 'MATERIAL' as const,
    ...overrides,
})

const material = (overrides: Record<string, unknown> = {}) => ({
    id: 'mat-1',
    materialCode: 'MAT-000008',
    materialName: 'KIRKLAND SIGNATURE FISH OIL 400',
    sku: 'SKU-000010',
    brand: null,
    model: null,
    manufacturer: null,
    shortDescription: null,
    description: null,
    status: 'ACTIVE',
    companyId: 'company-1',
    baseUomId: 'uom-btl',
    salesUomId: 'uom-btl',
    baseUom: { id: 'uom-btl', code: 'BTL', name: 'Bottle' },
    salesUom: { id: 'uom-btl', code: 'BTL', name: 'Bottle' },
    purchaseUom: null,
    materialType: { code: 'FG', name: 'Finished goods' },
    materialCategory: { code: 'SUP', name: 'Supplements' },
    currency: { code: 'PHP', symbol: 'P' },
    valuationClass: null,
    defaultWarehouse: null,
    inventoryManaged: true,
    batchManaged: false,
    serialManaged: false,
    expiryManaged: false,
    sellable: true,
    purchasable: true,
    qualityInspectionRequired: false,
    defaultShelfLifeDays: null,
    minimumStock: new Decimal(0),
    maximumStock: new Decimal(100),
    safetyStock: new Decimal(10),
    reorderPoint: new Decimal(20),
    reorderQuantity: new Decimal(0),
    minimumOrderQuantity: new Decimal(0),
    leadTimeDays: 0,
    valuationMethod: 'STANDARD',
    standardCost: new Decimal(80),
    weight: null,
    weightUom: null,
    length: null,
    width: null,
    height: null,
    dimensionUom: null,
    volume: null,
    volumeUom: null,
    ...overrides,
})

describe('SdMaterialReferenceService', () => {
    const prisma = {
        mmMaterial: { findFirst: jest.fn() },
        company: { findUniqueOrThrow: jest.fn() },
        warehouse: { findMany: jest.fn() },
        mmInventoryBalance: { findMany: jest.fn() },
    }
    const commercialAvailability = {
        getCompanyMaterialLedgerByWarehouses: jest.fn(),
    }
    const uomConversions = { convertQuantity: jest.fn() }
    const reorderRules = { resolveParamsForWarehouses: jest.fn() }

    let service: SdMaterialReferenceService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new SdMaterialReferenceService(
            prisma as never,
            commercialAvailability as never,
            uomConversions as never,
            reorderRules as never,
        )
        prisma.mmMaterial.findFirst.mockResolvedValue(material())
        prisma.company.findUniqueOrThrow.mockResolvedValue({ id: 'company-1' })
        prisma.warehouse.findMany.mockResolvedValue([
            { id: 'wh-1', code: 'MAIN', name: 'Main Warehouse', plantId: 'plant-1' },
            { id: 'wh-2', code: 'WEST', name: 'West Warehouse', plantId: 'plant-1' },
        ])
        commercialAvailability.getCompanyMaterialLedgerByWarehouses.mockResolvedValue([
            { warehouseId: 'wh-1', onHandQty: 50, reservedQty: 10, availableQty: 40 },
            { warehouseId: 'wh-2', onHandQty: 20, reservedQty: 5, availableQty: 15 },
        ])
        reorderRules.resolveParamsForWarehouses.mockResolvedValue(
            new Map([
                ['wh-1', params()],
                ['wh-2', params()],
            ]),
        )
    })

    it('reads linked material stock from the MM ledger across active company warehouses', async () => {
        const result = await service.getForProductCatalog(
            'mat-1',
            'company-1',
        )

        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).toHaveBeenCalledWith('mat-1', 'company-1', ['wh-1', 'wh-2'])
        expect(result.inventory).toMatchObject({
            onHandQty: 70,
            reservedQty: 15,
            availableQty: 55,
            maximumStock: 100,
            safetyStock: 10,
            stockScope: 'COMPANY_ACTIVE_WAREHOUSES',
        })
        expect(result.warehouseBreakdown).toHaveLength(2)
        expect(result.warehouseBreakdown[0]).toMatchObject({
            warehouseId: 'wh-1',
            onHand: 50,
            reserved: 10,
            available: 40,
        })
    })

    it('uses the material default warehouse and converts live quantities to sales UOM', async () => {
        prisma.mmMaterial.findFirst.mockResolvedValue(
            material({
                salesUomId: 'uom-case',
                salesUom: { id: 'uom-case', code: 'CASE', name: 'Case' },
                defaultWarehouse: {
                    id: 'wh-2',
                    code: 'WEST',
                    name: 'West Warehouse',
                    companyId: 'company-1',
                    plantId: 'plant-1',
                    status: 'ACTIVE',
                    deletedAt: null,
                },
            }),
        )
        commercialAvailability.getCompanyMaterialLedgerByWarehouses.mockResolvedValue([
            { warehouseId: 'wh-2', onHandQty: 24, reservedQty: 6, availableQty: 18 },
        ])
        reorderRules.resolveParamsForWarehouses.mockResolvedValue(
            new Map([
                [
                    'wh-2',
                    params({
                        maxStock: new Decimal(120),
                        safetyStock: new Decimal(24),
                        source: 'RULE',
                        scope: 'WAREHOUSE',
                    }),
                ],
            ]),
        )
        uomConversions.convertQuantity.mockImplementation(
            ({ quantity }: { quantity: number }) => new Decimal(quantity).div(12),
        )

        const result = await service.getForProductCatalog(
            'mat-1',
            'company-1',
        )

        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).toHaveBeenCalledWith('mat-1', 'company-1', ['wh-2'])
        expect(result.inventory).toMatchObject({
            onHandQty: 2,
            reservedQty: 0.5,
            availableQty: 1.5,
            maximumStock: 10,
            safetyStock: 2,
            stockScope: 'DEFAULT_WAREHOUSE',
        })
        expect(uomConversions.convertQuantity).toHaveBeenCalledWith(
            expect.objectContaining({
                materialId: 'mat-1',
                fromUomId: 'uom-btl',
                toUomId: 'uom-case',
            }),
        )
    })

    it('rejects a warehouse outside the requested company/plant scope instead of returning false zero stock', async () => {
        await expect(
            service.getForProductCatalog(
                'mat-1',
                'company-1',
                undefined,
                'warehouse-not-in-scope',
            ),
        ).rejects.toThrow(BadRequestException)

        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).not.toHaveBeenCalled()
    })

    it('requires companyId — never queries MM stock without company scope', async () => {
        await expect(
            service.getForProductCatalog('mat-1', '   '),
        ).rejects.toThrow(BadRequestException)
        await expect(
            service.getBatchForProductCatalog(['mat-1'], ''),
        ).rejects.toThrow(BadRequestException)
        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).not.toHaveBeenCalled()
    })

    it('rejects a material that belongs to another company', async () => {
        prisma.mmMaterial.findFirst.mockResolvedValue(
            material({ companyId: 'company-2' }),
        )
        await expect(
            service.getForProductCatalog('mat-1', 'company-1'),
        ).rejects.toThrow(BadRequestException)
        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).not.toHaveBeenCalled()
    })

    it('reports sellable stock as on hand minus reserved from the MM ledger', async () => {
        commercialAvailability.getCompanyMaterialLedgerByWarehouses.mockResolvedValue([
            { warehouseId: 'wh-1', onHandQty: 60, reservedQty: 25, availableQty: 35 },
            { warehouseId: 'wh-2', onHandQty: 0, reservedQty: 0, availableQty: 0 },
        ])
        const result = await service.getForProductCatalog('mat-1', 'company-1')

        expect(result.onHand).toBe(60)
        expect(result.reserved).toBe(25)
        expect(result.available).toBe(35)
        expect(result.inventory).toMatchObject({
            onHandQty: 60,
            reservedQty: 25,
            availableQty: 35,
            stockAvailable: 35,
            stockAvailableState: 'IN_STOCK',
        })
        expect(result.warehouseBreakdown).toEqual([
            expect.objectContaining({
                warehouseId: 'wh-1',
                onHand: 60,
                reserved: 25,
                available: 35,
            }),
            expect.objectContaining({ warehouseId: 'wh-2', available: 0 }),
        ])
    })

    it('a material with stock in MM is never reported as zero', async () => {
        commercialAvailability.getCompanyMaterialLedgerByWarehouses.mockResolvedValue([
            { warehouseId: 'wh-1', onHandQty: 140, reservedQty: 10, availableQty: 130 },
        ])
        prisma.warehouse.findMany.mockResolvedValue([
            { id: 'wh-1', code: 'MAIN', name: 'Main Warehouse', plantId: 'plant-1' },
        ])
        reorderRules.resolveParamsForWarehouses.mockResolvedValue(new Map())

        const result = await service.getForProductCatalog('mat-1', 'company-1')

        expect(result.onHand).toBe(140)
        expect(result.available).toBe(130)
        expect(result.available).toBeGreaterThan(0)
    })

    it('scopes the MM ledger query to the selected warehouse', async () => {
        const result = await service.getForProductCatalog(
            'mat-1',
            'company-1',
            undefined,
            'wh-2',
        )

        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).toHaveBeenCalledWith('mat-1', 'company-1', ['wh-2'])
        expect(result.inventory.stockScope).toBe('WAREHOUSE')
        expect(result.inventory.warehouseId).toBe('wh-2')
        expect(result.inventory.fulfillmentWarehouseCode).toBe('WEST')
    })

    it('scopes the MM ledger query by plant when one is requested', async () => {
        await service.getForProductCatalog(
            'mat-1',
            'company-1',
            undefined,
            undefined,
            'plant-9',
        )

        expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ plantId: 'plant-9' }),
            }),
        )
    })

    it('reads max / safety stock from MM stock thresholds, not from on-hand', async () => {
        reorderRules.resolveParamsForWarehouses.mockResolvedValue(
            new Map([
                [
                    'wh-1',
                    params({
                        maxStock: new Decimal(500),
                        safetyStock: new Decimal(40),
                        source: 'RULE',
                        scope: 'WAREHOUSE',
                    }),
                ],
                [
                    'wh-2',
                    params({
                        maxStock: new Decimal(200),
                        safetyStock: new Decimal(15),
                        source: 'RULE',
                        scope: 'WAREHOUSE',
                    }),
                ],
            ]),
        )

        const result = await service.getForProductCatalog('mat-1', 'company-1')

        // Both warehouses resolve a warehouse-specific rule → aggregate, never 0.
        expect(result.maxStock).toBe(700)
        expect(result.safetyStock).toBe(55)
        expect(result.warehouseBreakdown[0]).toMatchObject({
            warehouseId: 'wh-1',
            maxStock: 500,
            safetyStock: 40,
            thresholdSource: 'WAREHOUSE',
        })
    })

    it('marks stock OUT_OF_STOCK when MM says nothing is sellable', async () => {
        commercialAvailability.getCompanyMaterialLedgerByWarehouses.mockResolvedValue([
            { warehouseId: 'wh-1', onHandQty: 0, reservedQty: 0, availableQty: 0 },
        ])
        prisma.warehouse.findMany.mockResolvedValue([
            { id: 'wh-1', code: 'MAIN', name: 'Main Warehouse', plantId: 'plant-1' },
        ])
        reorderRules.resolveParamsForWarehouses.mockResolvedValue(new Map())

        const result = await service.getForProductCatalog('mat-1', 'company-1')

        expect(result.available).toBe(0)
        expect(result.inventory.stockAvailableState).toBe('OUT_OF_STOCK')
    })

    it('batch preview keeps working when one material cannot be read', async () => {
        prisma.mmMaterial.findFirst
            .mockResolvedValueOnce(material())
            .mockResolvedValueOnce(material({ id: 'mat-2' }))
            .mockResolvedValueOnce(null) // mat-3 was deleted in MM
        commercialAvailability.getCompanyMaterialLedgerByWarehouses
            .mockResolvedValueOnce([
                { warehouseId: 'wh-1', onHandQty: 50, reservedQty: 10, availableQty: 40 },
            ])
            .mockResolvedValueOnce([
                { warehouseId: 'wh-1', onHandQty: 5, reservedQty: 0, availableQty: 5 },
            ])

        const batch = await service.getBatchForProductCatalog(
            ['mat-1', 'mat-2', 'mat-3'],
            'company-1',
        )

        expect(batch.materials).toHaveLength(2)
        expect(batch.failures).toEqual([
            expect.objectContaining({ materialId: 'mat-3' }),
        ])
        // Resolved materials keep their real stock; the failure is not a silent 0.
        expect(batch.totals).toMatchObject({
            onHandQty: 55,
            availableQty: 45,
            reservedQty: 10,
        })
    })

    it('batch preview rejects an unknown materialId list or missing company', async () => {
        await expect(
            service.getBatchForProductCatalog([], 'company-1'),
        ).rejects.toThrow(BadRequestException)
        await expect(
            service.getBatchForProductCatalog(['mat-1'], ''),
        ).rejects.toThrow(BadRequestException)
    })

    it('batch preview does not query MM when the company is blank', async () => {
        await expect(
            service.getBatchForProductCatalog(['mat-1'], '  '),
        ).rejects.toThrow(BadRequestException)
        expect(
            commercialAvailability.getCompanyMaterialLedgerByWarehouses,
        ).not.toHaveBeenCalled()
    })
})
