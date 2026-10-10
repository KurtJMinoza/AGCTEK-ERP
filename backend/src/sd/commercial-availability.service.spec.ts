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
        inventoryAtp.getAvailabilityBatch.mockResolvedValue(
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
        inventoryAtp.getAvailabilityBatch.mockResolvedValue(
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

        expect(inventoryAtp.getAvailabilityBatch).toHaveBeenCalledWith(
            'company-1',
            [{ warehouseId: 'warehouse-1', materialId: 'material-1' }],
        )
    })
})
