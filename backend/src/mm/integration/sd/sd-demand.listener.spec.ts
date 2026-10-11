import { PrismaService } from '../../../prisma/prisma.service'
import { MmEventConsumerService } from '../../common/mm-event-consumer.service'
import { MmDemandSyncService } from '../demand/mm-demand-sync.service'
import { SdIntegrationService } from './sd-integration.service'
import { SdDemandListener } from './sd-demand.listener'

describe('SdDemandListener warehouse-split fulfillment', () => {
    it('reserves and releases picking work against each fulfillment warehouse', async () => {
        const sdIntegration = {
            checkAvailabilityBatch: jest.fn().mockResolvedValue({ ok: true }),
            reserveFromSalesOrderPayload: jest.fn().mockResolvedValue({}),
        }
        const consumer = {
            handleIdempotent: jest.fn(async ({
                handler,
            }: {
                handler: () => Promise<unknown>
            }) => ({
                result: await handler(),
                duplicate: false,
            })),
        }
        const demandSync = { upsertMany: jest.fn().mockResolvedValue([]) }
        const prisma = {
            mmMaterial: {
                findMany: jest.fn(({
                    where,
                }: {
                    where: { id: { in: string[] } }
                }) =>
                    Promise.resolve(
                        where.id.in.map((id: string) => ({
                            id,
                            baseUomId: 'uom-each',
                        })),
                    ),
                ),
            },
        }
        const listener = new SdDemandListener(
            sdIntegration as unknown as SdIntegrationService,
            consumer as unknown as MmEventConsumerService,
            demandSync as unknown as MmDemandSyncService,
            prisma as unknown as PrismaService,
        )
        const first = {
            salesOrderId: 'so-1',
            companyId: 'company-1',
            warehouseId: 'warehouse-a',
            idempotencyKey: 'checkout-1:warehouse:warehouse-a',
            lines: [
                {
                    lineId: 'line-1',
                    materialId: 'material-a',
                    quantity: '2',
                },
            ],
        }
        const second = {
            salesOrderId: 'so-1',
            companyId: 'company-1',
            warehouseId: 'warehouse-b',
            idempotencyKey: 'checkout-1:warehouse:warehouse-b',
            lines: [
                {
                    lineId: 'line-2',
                    materialId: 'material-b',
                    quantity: '1',
                },
            ],
        }

        await listener.onSalesOrderConfirmed({
            payload: {
                ...first,
                fulfillments: [first, second],
            },
        })

        expect(sdIntegration.checkAvailabilityBatch).toHaveBeenCalledWith(
            expect.objectContaining({ warehouseId: 'warehouse-a' }),
        )
        expect(sdIntegration.checkAvailabilityBatch).toHaveBeenCalledWith(
            expect.objectContaining({ warehouseId: 'warehouse-b' }),
        )
        expect(sdIntegration.reserveFromSalesOrderPayload).toHaveBeenCalledWith(
            first,
        )
        expect(sdIntegration.reserveFromSalesOrderPayload).toHaveBeenCalledWith(
            second,
        )
        expect(demandSync.upsertMany).toHaveBeenCalledTimes(2)
    })
})
