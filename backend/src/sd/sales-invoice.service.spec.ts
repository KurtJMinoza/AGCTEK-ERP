import { NotFoundException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { SalesInvoiceService } from './sales-invoice.service'

describe('SalesInvoiceService payment projection', () => {
    const prisma = {
        sdSalesOrder: {
            findUnique: jest.fn(),
        },
        sdSalesInvoice: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            groupBy: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        sdSalesInvoiceLine: {
            update: jest.fn(),
        },
        sdCustomer: {
            findMany: jest.fn(),
        },
        shipment: {
            findMany: jest.fn(),
        },
        tripStopShipment: {
            findMany: jest.fn(),
        },
    }

    let service: SalesInvoiceService

    beforeEach(() => {
        jest.clearAllMocks()
        prisma.shipment.findMany.mockResolvedValue([])
        prisma.tripStopShipment.findMany.mockResolvedValue([])
        service = new SalesInvoiceService(prisma as unknown as PrismaService)
    })

    const invoiceRow = (customerId: string, overrides: Record<string, unknown> = {}) => ({
        id: `inv-${customerId}`,
        invoiceNumber: 'INV-20261014-0001',
        status: 'ISSUED',
        salesOrder: {
            orderNumber: 'SO-1',
            customerId,
            customerName: 'Juan Dela Cruz',
            customerEmail: 'juan@example.com',
            paymentMethod: 'COD',
            paymentStatus: 'Pending Collection',
        },
        ...overrides,
    })

    describe('findOne', () => {
        it('returns the invoice with bill-to', async () => {
            prisma.sdSalesInvoice.findUnique.mockResolvedValue(invoiceRow('web-user-9'))
            prisma.sdCustomer.findMany.mockResolvedValue([])

            const result = await service.findOne('inv-web-user-9')

            expect(result.billTo.name).toBe('Juan Dela Cruz')
            expect(result.billingStatus).toBe('UNPAID')
        })

        it('throws NotFound for an unknown invoice', async () => {
            prisma.sdSalesInvoice.findUnique.mockResolvedValue(null)
            await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException)
        })
    })

    it('marks only a posted invoice paid — a DRAFT is never Paid before POD', async () => {
        const paidAt = new Date('2026-10-10T08:30:00.000Z')
        prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })

        await service.markPaidForSalesOrder('so-1', paidAt)

        expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledWith({
            where: { salesOrderId: 'so-1', status: 'ISSUED' },
            data: { status: 'PAID', paidAt },
        })
    })

    describe('issueForSalesOrder (POD posting)', () => {
        it('posts a DRAFT, then settles it PAID with the payment timestamp', async () => {
            const paidAt = new Date('2026-10-10T08:30:00.000Z')
            prisma.sdSalesInvoice.findUnique
                .mockResolvedValueOnce({ id: 'inv-1', status: 'DRAFT', lines: [] })
                .mockResolvedValueOnce({ id: 'inv-1', status: 'PAID', paidAt })
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesOrder.findUnique.mockResolvedValue({
                paymentStatus: 'Paid',
                payments: [{ paidAt }],
            })

            const result = await service.issueForSalesOrder('so-1')

            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenNthCalledWith(1, {
                where: { id: 'inv-1', status: 'DRAFT' },
                data: { status: 'ISSUED', issuedAt: expect.any(Date) },
            })
            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenNthCalledWith(2, {
                where: { salesOrderId: 'so-1', status: 'ISSUED' },
                data: { status: 'PAID', paidAt },
            })
            expect(result).toMatchObject({ status: 'PAID' })
        })

        it('posts an unpaid COD invoice as ISSUED and leaves payment untouched', async () => {
            prisma.sdSalesInvoice.findUnique
                .mockResolvedValueOnce({ id: 'inv-1', status: 'DRAFT', lines: [] })
                .mockResolvedValueOnce({ id: 'inv-1', status: 'ISSUED' })
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesOrder.findUnique.mockResolvedValue({
                paymentStatus: 'Pending Collection',
                payments: [],
            })

            await service.issueForSalesOrder('so-1')

            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledTimes(1)
            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledWith({
                where: { id: 'inv-1', status: 'DRAFT' },
                data: { status: 'ISSUED', issuedAt: expect.any(Date) },
            })
        })

        it('rewrites DRAFT qty/total from POD acceptance before posting', async () => {
            const Decimal = (
                await import('@prisma/client/runtime/library')
            ).Decimal
            prisma.shipment.findMany.mockResolvedValue([
                {
                    id: 'sh-1',
                    lines: [
                        { id: 'sl-1', quantity: 10, packageItemId: 'pi-1' },
                    ],
                },
            ])
            prisma.tripStopShipment.findMany.mockResolvedValue([
                {
                    shipmentId: 'sh-1',
                    tripStop: {
                        codAmountDue: 1039.2,
                        lines: [
                            { shipmentLineId: 'sl-1', acceptedQuantity: 8 },
                        ],
                    },
                },
            ])
            Object.assign(prisma, {
                wmPackageItem: {
                    findUnique: jest
                        .fn()
                        .mockResolvedValue({ materialId: 'm-1' }),
                },
                mmInventoryReservationHeader: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'rh-1' }),
                },
                mmInventoryReservationLine: {
                    findMany: jest
                        .fn()
                        .mockResolvedValue([
                            { demandReferenceLineId: 'ol-1' },
                        ]),
                },
            })

            prisma.sdSalesInvoice.findUnique
                .mockResolvedValueOnce({
                    id: 'inv-1',
                    status: 'DRAFT',
                    invoiceNumber: 'INV-1',
                    discountAmount: new Decimal(0),
                    shippingAmount: new Decimal(50),
                    lines: [
                        {
                            id: 'il-1',
                            salesOrderLineId: 'ol-1',
                            quantity: new Decimal(10),
                            unitPrice: new Decimal(129.9),
                            lineTotal: new Decimal(1299),
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    id: 'inv-1',
                    status: 'DRAFT',
                    invoiceNumber: 'INV-1',
                    discountAmount: new Decimal(0),
                    shippingAmount: new Decimal(50),
                    lines: [
                        {
                            id: 'il-1',
                            salesOrderLineId: 'ol-1',
                            quantity: new Decimal(10),
                            unitPrice: new Decimal(129.9),
                            lineTotal: new Decimal(1299),
                        },
                    ],
                })
                .mockResolvedValueOnce({
                    id: 'inv-1',
                    status: 'ISSUED',
                    totalAmount: new Decimal(1039.2),
                })
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesInvoiceLine.update.mockResolvedValue({})
            prisma.sdSalesOrder.findUnique.mockResolvedValue({
                paymentStatus: 'Pending Collection',
                payments: [],
            })

            await service.issueForSalesOrder('so-1')

            expect(prisma.sdSalesInvoiceLine.update).toHaveBeenCalledWith({
                where: { id: 'il-1' },
                data: {
                    quantity: 8,
                    lineTotal: expect.objectContaining({
                        toString: expect.any(Function),
                    }),
                },
            })
            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'inv-1', status: 'DRAFT' },
                    data: expect.objectContaining({
                        totalAmount: expect.anything(),
                    }),
                }),
            )
        })

        it('is a no-op re-post for an already posted invoice', async () => {
            prisma.sdSalesInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'ISSUED' })
            prisma.sdSalesOrder.findUnique.mockResolvedValue({
                paymentStatus: 'Pending Collection',
                payments: [],
            })

            await service.issueForSalesOrder('so-1')

            expect(prisma.sdSalesInvoice.updateMany).not.toHaveBeenCalled()
        })
    })
})
