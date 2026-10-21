import type { PrismaService } from '../prisma/prisma.service'
import { SalesInvoiceService } from './sales-invoice.service'
import { SdFulfillmentEventsListener } from './sd-fulfillment-events.listener'

describe('SdFulfillmentEventsListener', () => {
    it('marks an order delivered only from a delivered shipment and supports the direct package order link', async () => {
        const podAt = new Date('2026-10-14T03:15:00.000Z')
        const prisma = {
            shipment: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        deliveredAt: podAt,
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

        // Failed-stop shipments (EXCEPTION_HOLD) on a completed trip are ignored.
        expect(prisma.shipment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: { in: ['shipment-1'] }, status: 'DELIVERED' },
            }),
        )
        expect(prisma.sdSalesOrder.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ['so-1'] } },
            data: { status: 'DELIVERED' },
        })
        // POD timestamp from SCM, written only if the order has none yet.
        expect(prisma.sdSalesOrder.updateMany).toHaveBeenCalledWith({
            where: { id: 'so-1', deliveredAt: null },
            data: { deliveredAt: podAt },
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

    it('drafts (does not post) the invoice at dispatch — posting waits for POD', async () => {
        const prisma = {
            mmGoodsIssue: {
                findUnique: jest.fn().mockResolvedValue({
                    sourceDocumentType: 'SALES_ORDER',
                    sourceDocumentId: 'so-1',
                    warehouseId: 'wh-1',
                }),
            },
            sdSalesOrder: {
                findUnique: jest.fn().mockResolvedValue({ companyId: 'co-1', warehouseId: 'wh-1' }),
                update: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            sdShipment: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({}),
            },
        }
        const invoices = {
            createForSalesOrder: jest.fn().mockResolvedValue({}),
            issueForSalesOrder: jest.fn(),
        }
        const listener = new SdFulfillmentEventsListener(
            prisma as unknown as PrismaService,
            invoices as unknown as SalesInvoiceService,
        )

        await listener.onGoodsIssuePosted({ goodsIssueId: 'gi-1' })

        expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith({
            where: { id: 'so-1' },
            data: { status: 'SHIPPED' },
        })
        expect(invoices.createForSalesOrder).toHaveBeenCalledWith('so-1')
        expect(invoices.issueForSalesOrder).not.toHaveBeenCalled()
    })

    it('projects the courier carrier and tracking number onto the sales order, and clears it on cancel', async () => {
        const prisma = {
            shipment: {
                findUnique: jest.fn().mockResolvedValue({
                    package: { salesOrderId: null, pickingTask: { salesOrderId: 'so-legacy' } },
                }),
            },
            sdSalesOrder: { update: jest.fn().mockResolvedValue({}) },
        }
        const listener = new SdFulfillmentEventsListener(
            prisma as unknown as PrismaService,
            {} as unknown as SalesInvoiceService,
        )

        await listener.onCourierChanged({
            shipmentId: 'shp-1',
            carrierName: 'J&T Express',
            trackingNumber: 'JT123',
        })
        expect(prisma.sdSalesOrder.update).toHaveBeenLastCalledWith({
            where: { id: 'so-legacy' },
            data: { courierName: 'J&T Express', trackingNumber: 'JT123' },
        })

        await listener.onCourierChanged({
            shipmentId: 'shp-1',
            carrierName: null,
            trackingNumber: null,
        })
        expect(prisma.sdSalesOrder.update).toHaveBeenLastCalledWith({
            where: { id: 'so-legacy' },
            data: { courierName: null, trackingNumber: null },
        })
    })

    it('skips the courier projection for shipments without a sales order', async () => {
        const prisma = {
            shipment: { findUnique: jest.fn().mockResolvedValue({ package: null }) },
            sdSalesOrder: { update: jest.fn() },
        }
        const listener = new SdFulfillmentEventsListener(
            prisma as unknown as PrismaService,
            {} as unknown as SalesInvoiceService,
        )
        await listener.onCourierChanged({
            shipmentId: 'manual-shp',
            carrierName: 'LBC Express',
            trackingNumber: 'LBC1',
        })
        expect(prisma.sdSalesOrder.update).not.toHaveBeenCalled()
    })
})
