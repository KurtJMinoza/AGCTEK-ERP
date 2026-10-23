import { BadRequestException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { atpPairKey } from '../mm/inventory/inventory-availability.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import type { MarketplaceCheckoutLineDto } from './dto/sales-order.dto'

describe('CommercialAvailabilityService checkout ATP gate', () => {
    const prisma = {
        sdProductVariant: { findFirst: jest.fn() },
        mmMaterial: { findUnique: jest.fn() },
    }
    const materialResolution = {
        findProductByDivisionSku: jest.fn(),
        resolveMaterialForProduct: jest.fn(),
    }
    const fulfillmentDetermination = {
        determineWarehouse: jest.fn(),
    }
    const inventoryAtp = {
        getAvailabilityBatch: jest.fn(),
        getPickableAvailabilityBatch: jest.fn(),
    }
    const uom = { toBaseUom: jest.fn() }

    let service: CommercialAvailabilityService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new CommercialAvailabilityService(
            materialResolution as never,
            fulfillmentDetermination as never,
            {} as never,
            inventoryAtp as never,
            uom as never,
            prisma as never,
        )
        materialResolution.findProductByDivisionSku.mockResolvedValue({
            id: 'product-1',
            name: 'KIRKLAND Vitamin E',
            productType: 'STOCK_ITEM',
        })
        materialResolution.resolveMaterialForProduct.mockResolvedValue({
            materialId: 'material-1',
            salesUomId: 'uom-each',
            materialUomId: null,
            baseUomId: 'uom-each',
            atpRelevant: true,
        })
        prisma.mmMaterial.findUnique.mockResolvedValue({ baseUomId: 'uom-each' })
        uom.toBaseUom.mockResolvedValue({
            quantity: new Decimal(1),
            baseUomId: 'uom-each',
        })
        fulfillmentDetermination.determineWarehouse.mockResolvedValue({
            warehouseId: 'warehouse-1',
        })
    })

    const line = (quantity: number): MarketplaceCheckoutLineDto => ({
        divisionId: 'DIV_RETAIL',
        sku: 'RET-PRD-000001',
        description: 'KIRKLAND Vitamin E',
        quantity,
        unitPrice: 90,
        lineTotal: quantity * 90,
    })

    it('rejects an out-of-stock material before checkout persists an order', async () => {
        inventoryAtp.getPickableAvailabilityBatch.mockResolvedValue(
            new Map([
                [
                    atpPairKey('warehouse-1', 'material-1'),
                    { available: 0 },
                ],
            ]),
        )

        await expect(
            service.assertMarketplaceCheckoutAvailability({
                companyId: 'company-1',
                lines: [line(1)],
            }),
        ).rejects.toThrow(BadRequestException)
        await expect(
            service.assertMarketplaceCheckoutAvailability({
                companyId: 'company-1',
                lines: [line(1)],
            }),
        ).rejects.toThrow('KIRKLAND Vitamin E is out of stock')
    })

    it('adds duplicate material quantities before checking ATP', async () => {
        uom.toBaseUom
            .mockResolvedValueOnce({
                quantity: new Decimal(2),
                baseUomId: 'uom-each',
            })
            .mockResolvedValueOnce({
                quantity: new Decimal(3),
                baseUomId: 'uom-each',
            })
        inventoryAtp.getPickableAvailabilityBatch.mockResolvedValue(
            new Map([
                [
                    atpPairKey('warehouse-1', 'material-1'),
                    { available: 4 },
                ],
            ]),
        )

        await expect(
            service.assertMarketplaceCheckoutAvailability({
                companyId: 'company-1',
                lines: [line(2), line(3)],
            }),
        ).rejects.toThrow('Available: 4; requested: 5')

        expect(
            inventoryAtp.getPickableAvailabilityBatch,
        ).toHaveBeenCalledWith('company-1', [
            { warehouseId: 'warehouse-1', materialId: 'material-1' },
        ])
    })
})

describe('CommercialAvailabilityService.getQuotationLineStock (soft quotation signal)', () => {
    const prisma = {
        sdProductVariant: { findFirst: jest.fn() },
        sdProduct: { findUnique: jest.fn() },
        mmMaterial: { findUniqueOrThrow: jest.fn() },
    }
    const materialResolution = { resolveMaterialForProduct: jest.fn() }
    const fulfillmentDetermination = { defaultCompanyId: jest.fn() }
    const inventoryAtp = { getPickableMaterialTotals: jest.fn() }
    const uom = { toBaseUom: jest.fn() }
    let service: CommercialAvailabilityService

    const available = (qty: number) =>
        inventoryAtp.getPickableMaterialTotals.mockResolvedValue({ onHandQty: qty, availableQty: qty, reservedQty: 0 })

    beforeEach(() => {
        jest.clearAllMocks()
        service = new CommercialAvailabilityService(
            materialResolution as never,
            fulfillmentDetermination as never,
            {} as never,
            inventoryAtp as never,
            uom as never,
            prisma as never,
        )
        fulfillmentDetermination.defaultCompanyId.mockResolvedValue('company-1')
        prisma.sdProductVariant.findFirst.mockResolvedValue({
            materialId: 'material-1',
            companyId: null,
            salesUomId: 'uom-box',
            materialUomId: null,
        })
        uom.toBaseUom.mockImplementation(async (_m: string, _u: string, qty: number) => ({
            quantity: new Decimal(qty * 12),
        }))
    })

    it('compares company-wide available stock with the line quantity in base units', async () => {
        available(30)

        const [line] = await service.getQuotationLineStock([{ productId: 'p1', quantity: 2 }])

        expect(line).toEqual({
            productId: 'p1',
            quantity: 2,
            state: 'OK',
            availableBaseQty: 30,
            requiredBaseQty: 24,
        })
        expect(inventoryAtp.getPickableMaterialTotals).toHaveBeenCalledWith('company-1', 'material-1')
        expect(uom.toBaseUom).toHaveBeenCalledWith('material-1', 'uom-box', 2)
    })

    it.each([
        [30, 3, 'LOW'],
        [0, 1, 'NONE'],
        [-4, 1, 'NONE'],
    ])('available %i for %i box(es) → %s', async (stock, qty, state) => {
        available(stock)
        const [line] = await service.getQuotationLineStock([{ productId: 'p1', quantity: qty }])
        expect(line.state).toBe(state)
    })

    it('marks products without a stock item as NOT_TRACKED, never NONE', async () => {
        prisma.sdProductVariant.findFirst
            .mockResolvedValueOnce({ materialId: null, companyId: null, salesUomId: null, materialUomId: null })
            .mockResolvedValueOnce(null)
        prisma.sdProduct.findUnique.mockResolvedValue({ productType: 'SERVICE', divisionId: 'DIV_A' })

        const lines = await service.getQuotationLineStock([
            { productId: 'variant-without-material', quantity: 1 },
            { productId: 'service', quantity: 1 },
        ])

        expect(lines.map((l) => l.state)).toEqual(['NOT_TRACKED', 'NOT_TRACKED'])
        expect(inventoryAtp.getPickableMaterialTotals).not.toHaveBeenCalled()
    })

    it('uses the legacy product assignment when the product has no variant', async () => {
        prisma.sdProductVariant.findFirst.mockResolvedValue(null)
        prisma.sdProduct.findUnique.mockResolvedValue({ productType: 'STOCK_ITEM', divisionId: 'DIV_A' })
        materialResolution.resolveMaterialForProduct.mockResolvedValue({
            materialId: 'material-9',
            companyId: 'company-2',
            salesUomId: 'uom-each',
            atpRelevant: true,
        })
        uom.toBaseUom.mockResolvedValue({ quantity: new Decimal(5) })
        available(5)

        const [line] = await service.getQuotationLineStock([{ productId: 'legacy', quantity: 5 }])

        expect(line.state).toBe('OK')
        expect(inventoryAtp.getPickableMaterialTotals).toHaveBeenCalledWith('company-2', 'material-9')
    })

    it('reports UNKNOWN for a failed read without failing the other lines', async () => {
        inventoryAtp.getPickableMaterialTotals
            .mockRejectedValueOnce(new Error('MM down'))
            .mockResolvedValueOnce({ onHandQty: 100, availableQty: 100, reservedQty: 0 })

        const lines = await service.getQuotationLineStock([
            { productId: 'p1', quantity: 1 },
            { productId: 'p2', quantity: 1 },
        ])

        expect(lines.map((l) => l.state)).toEqual(['UNKNOWN', 'OK'])
        expect(lines[0]).toMatchObject({ availableBaseQty: null, requiredBaseQty: null })
    })

    it('reports UNKNOWN for every line when no checkout company is configured', async () => {
        fulfillmentDetermination.defaultCompanyId.mockRejectedValue(new Error('No company'))

        const lines = await service.getQuotationLineStock([{ productId: 'p1', quantity: 1 }])

        expect(lines[0].state).toBe('UNKNOWN')
        expect(prisma.sdProductVariant.findFirst).not.toHaveBeenCalled()
    })
})
