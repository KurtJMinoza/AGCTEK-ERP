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
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    }

    let service: SalesInvoiceService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new SalesInvoiceService(prisma as unknown as PrismaService)
    })

    it('lists invoices with the authoritative sales-order payment projection', async () => {
        prisma.sdSalesInvoice.findMany.mockResolvedValue([])

        await service.listByCompany('company-1')

        expect(prisma.sdSalesInvoice.findMany).toHaveBeenCalledWith({
            where: { companyId: 'company-1' },
            include: {
                lines: { orderBy: { lineNumber: 'asc' } },
                salesOrder: {
                    select: {
                        paymentMethod: true,
                        paymentStatus: true,
                        paymentReference: true,
                        paymentProvider: true,
                        isDemoPayment: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        })
    })

    it('marks all non-terminal invoices for a paid sales order as paid', async () => {
        const paidAt = new Date('2026-10-10T08:30:00.000Z')
        prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })

        await service.markPaidForSalesOrder('so-1', paidAt)

        expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledWith({
            where: {
                salesOrderId: 'so-1',
                status: { notIn: ['CANCELLED', 'REFUNDED'] },
            },
            data: { status: 'PAID', paidAt },
        })
    })

    it('issues a paid invoice as PAID using the payment record timestamp', async () => {
        const paidAt = new Date('2026-10-10T08:30:00.000Z')
        prisma.sdSalesOrder.findUnique.mockResolvedValue({
            paymentStatus: 'Paid',
            payments: [{ paidAt }],
        })
        prisma.sdSalesInvoice.findUnique.mockResolvedValue({
            id: 'inv-1',
            status: 'DRAFT',
        })
        prisma.sdSalesInvoice.update.mockResolvedValue({
            id: 'inv-1',
            status: 'PAID',
            paidAt,
        })

        await service.issueForSalesOrder('so-1')

        expect(prisma.sdSalesOrder.findUnique).toHaveBeenCalledWith({
            where: { id: 'so-1' },
            select: {
                paymentStatus: true,
                payments: {
                    where: { status: 'Paid' },
                    orderBy: { paidAt: 'desc' },
                    take: 1,
                    select: { paidAt: true },
                },
            },
        })
        expect(prisma.sdSalesInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'inv-1' },
                data: expect.objectContaining({
                    status: 'PAID',
                    paidAt,
                    issuedAt: expect.any(Date),
                }),
                include: expect.objectContaining({
                    salesOrder: expect.any(Object),
                }),
            }),
        )
    })
})
