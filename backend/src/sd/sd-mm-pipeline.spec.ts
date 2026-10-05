import { Decimal } from '@prisma/client/runtime/library'
import { SdMmPipelineService } from './sd-mm-pipeline.service'
import { SD_MM_ERROR } from './sd-integration.errors'

describe('SdMmPipelineService', () => {
    const prisma = {
        sdSalesOrder: { findUnique: jest.fn(), update: jest.fn() },
        sdSalesOrderLine: { update: jest.fn() },
        sdProduct: { findUnique: jest.fn() },
        mmMaterial: { findUnique: jest.fn() },
    }
    const uom = { toBaseUom: jest.fn() }
    const materialResolution = {
        findProductByDivisionSku: jest.fn(),
        resolveMaterialForProduct: jest.fn(),
    }
    const fulfillmentDetermination = {
        defaultCompanyId: jest.fn().mockResolvedValue('co-1'),
        determineWarehouse: jest.fn().mockResolvedValue({
            companyId: 'co-1',
            warehouseId: 'wh-1',
        }),
    }
    const fulfillment = { syncFulfillmentsForOrder: jest.fn() }
    const sdEvents = { emit: jest.fn() }

    let service: SdMmPipelineService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new SdMmPipelineService(
            prisma as any,
            uom as any,
            materialResolution as any,
            fulfillmentDetermination as any,
            fulfillment as any,
            sdEvents as any,
        )
    })

    it('isMmLinked requires company, warehouse, material and base qty', () => {
        expect(
            service.isMmLinked({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                lines: [{ materialId: 'm1', baseQuantity: new Decimal(1) }],
            }),
        ).toBe(true)
        expect(
            service.isMmLinked({
                companyId: 'co-1',
                warehouseId: 'wh-1',
                lines: [{ materialId: null, baseQuantity: null }],
            }),
        ).toBe(false)
    })

    it('toEventPayload uses base quantity for MM reservation', () => {
        const payload = service.toEventPayload({
            id: 'so-1',
            orderNumber: 'SO-000001',
            companyId: 'co-1',
            warehouseId: 'wh-1',
            customerId: 'cust',
            correlationId: 'corr',
            idempotencyKey: 'idem',
            lines: [
                {
                    id: 'line-1',
                    lineNumber: 1,
                    materialId: 'mat-1',
                    quantity: new Decimal(10),
                    baseQuantity: new Decimal(240),
                },
            ],
        })
        expect(payload.lines[0].quantity).toBe('240')
    })
})

describe('MaterialResolutionService errors', () => {
    it('exposes stable error codes', () => {
        expect(SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING).toBe(
            'PRODUCT_MATERIAL_MAPPING_MISSING',
        )
    })
})
