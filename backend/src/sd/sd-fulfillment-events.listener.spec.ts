import type { PrismaService } from '../prisma/prisma.service'
import { SalesInvoiceService } from './sales-invoice.service'
import { SdFulfillmentEventsListener } from './sd-fulfillment-events.listener'

describe('SdFulfillmentEventsListener', () => {
    it('marks an order delivered only from a delivered shipment and supports the direct package order link', async () => {
        const prisma = {
            shipment: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        package: {
                            salesOrderId: 'so-1',
                            pickingTask: { salesOrderId: 'legacy-so' },
                        },
                    },
                ]),
            },
            sdSalesOrder: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        }
        const invoices = {
            issueForSalesOrder: jest.fn().mockResolvedValue({}),
        }
        const listener = new SdFulfillmentEventsListener(
            prisma as unknown as PrismaService,
            invoices as unknown as SalesInvoiceService,
        )

        await listener.onShipmentDelivered({ shipmentIds: ['shipment-1'] })

        expect(prisma.sdSalesOrder.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['so-1'] } },
            data: { status: 'DELIVERED' },
        })
        expect(invoices.issueForSalesOrder).toHaveBeenCalledWith('so-1')
        expect(invoices.issueForSalesOrder).not.toHaveBeenCalledWith(
            'legacy-so',
        )
    })

    it('does not mark an order delivered when the delivery event has no shipments', async () => {
        const prisma = {
            shipment: { findMany: jest.fn() },
            sdSalesOrder: { updateMany: jest.fn() },
        }
        const invoices = { issueForSalesOrder: jest.fn() }
        const listener = new SdFulfillmentEventsListener(
            prisma as unknown as PrismaService,
            invoices as unknown as SalesInvoiceService,
        )

        await listener.onShipmentDelivered({ shipmentIds: [] })

        expect(prisma.shipment.findMany).not.toHaveBeenCalled()
        expect(prisma.sdSalesOrder.updateMany).not.toHaveBeenCalled()
    })
})
