import { Decimal } from '@prisma/client/runtime/library'
import { SdMmPipelineService } from './sd-mm-pipeline.service'
import { SD_MM_ERROR } from './sd-integration.errors'

describe('SdMmPipelineService', () => {
    const prisma = {
        sdSalesOrder: { findUnique: jest.fn(), update: jest.fn() },
        sdSalesOrderLine: { update: jest.fn() },
        sdFulfillment: { findMany: jest.fn() },
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
            channel: 'ECOMMERCE',
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
        expect(payload.channel).toBe('ECOMMERCE')
        expect(payload.lines[0].quantity).toBe('240')
    })

    it('emits each persisted fulfillment against its own warehouse and order lines', async () => {
        prisma.sdFulfillment.findMany.mockResolvedValue([
            {
                id: 'fulfillment-a',
                warehouseId: 'wh-a',
                lines: [
                    {
                        salesOrderLineId: 'line-a',
                        materialId: 'mat-a',
                        baseQty: new Decimal(2),
                    },
                ],
            },
            {
                id: 'fulfillment-b',
                warehouseId: 'wh-b',
                lines: [
                    {
                        salesOrderLineId: 'line-b',
                        materialId: 'mat-b',
                        baseQty: new Decimal(1),
                    },
                ],
            },
        ])
        const order = {
            id: 'so-1',
            orderNumber: 'SO-000001',
            channel: 'ECOMMERCE',
            companyId: 'co-1',
            warehouseId: 'wh-a',
            customerId: 'cust-1',
            correlationId: 'corr-1',
            idempotencyKey: 'checkout-1',
            lines: [
                {
                    id: 'line-a',
                    lineNumber: 1,
                    materialId: 'mat-a',
                    quantity: new Decimal(2),
                    baseQuantity: new Decimal(2),
                },
                {
                    id: 'line-b',
                    lineNumber: 2,
                    materialId: 'mat-b',
                    quantity: new Decimal(1),
                    baseQuantity: new Decimal(1),
                },
            ],
        }

        await service.emitSalesOrderConfirmedIntegration(order as never)

        expect(sdEvents.emit).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                fulfillments: [
                    expect.objectContaining({
                        fulfillmentId: 'fulfillment-a',
                        warehouseId: 'wh-a',
                        lines: [
                            expect.objectContaining({
                                lineId: 'line-a',
                                materialId: 'mat-a',
                                quantity: '2',
                            }),
                        ],
                    }),
                    expect.objectContaining({
                        fulfillmentId: 'fulfillment-b',
                        warehouseId: 'wh-b',
                        lines: [
                            expect.objectContaining({
                                lineId: 'line-b',
                                materialId: 'mat-b',
                                quantity: '1',
                            }),
                        ],
                    }),
                ],
            }),
        )
    })
})

describe('MaterialResolutionService errors', () => {
    it('exposes stable error codes', () => {
        expect(SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING).toBe(
            'PRODUCT_MATERIAL_MAPPING_MISSING',
        )
    })
})
