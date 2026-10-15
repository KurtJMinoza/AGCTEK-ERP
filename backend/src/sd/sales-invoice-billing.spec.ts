import type { PrismaService } from '../prisma/prisma.service'
import {
    billingStatusOf,
    billingStatusWhere,
    dueDateFor,
    overdueCutoff,
} from './sales-invoice-billing'
import { SalesInvoicePdfService } from './sales-invoice-pdf.service'
import type { InvoicePdfInput } from './sales-invoice-pdf.model'
import { SalesInvoiceService, outstandingOf } from './sales-invoice.service'

const NOW = new Date('2026-10-14T00:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe('billing status mapping', () => {
    it('due date is issue date + 30 days', () => {
        expect(dueDateFor(new Date('2026-10-01T00:00:00.000Z'))).toEqual(
            new Date('2026-10-31T00:00:00.000Z'),
        )
        expect(dueDateFor(null)).toBeNull()
    })

    it.each([
        ['ISSUED today', 'ISSUED', daysAgo(0), 'UNPAID'],
        ['ISSUED exactly 30 days ago', 'ISSUED', daysAgo(30), 'UNPAID'],
        ['ISSUED 31 days ago', 'ISSUED', daysAgo(31), 'OVERDUE'],
        ['ISSUED without issue date', 'ISSUED', null, 'UNPAID'],
        ['PAID long ago', 'PAID', daysAgo(90), 'PAID'],
        ['CANCELLED', 'CANCELLED', daysAgo(90), 'CANCELLED'],
        ['REFUNDED', 'REFUNDED', daysAgo(90), 'REFUNDED'],
        ['DRAFT', 'DRAFT', null, 'DRAFT'],
    ])('%s → %s', (_label, status, issuedAt, expected) => {
        expect(billingStatusOf({ status, issuedAt }, NOW)).toBe(expected)
    })

    it('builds query filters that match the in-memory mapping', () => {
        const cutoff = overdueCutoff(NOW)
        expect(cutoff).toEqual(daysAgo(30))
        expect(billingStatusWhere('OVERDUE', NOW)).toEqual({
            status: 'ISSUED',
            issuedAt: { lt: cutoff },
        })
        expect(billingStatusWhere('UNPAID', NOW)).toEqual({
            status: 'ISSUED',
            OR: [{ issuedAt: null }, { issuedAt: { gte: cutoff } }],
        })
        expect(billingStatusWhere('PAID', NOW)).toEqual({ status: 'PAID' })
    })
})

describe('KPI math', () => {
    it('outstanding is issued totals minus refunds, without float drift', () => {
        expect(outstandingOf({ totalAmount: '0.3', refundedAmount: '0.1' })).toBe(0.2)
        expect(outstandingOf({ totalAmount: '12500.50', refundedAmount: '500.25' })).toBe(12000.25)
        expect(outstandingOf({ totalAmount: null, refundedAmount: null })).toBe(0)
    })

    it('list aggregates KPIs in the database over the same scope, hiding DRAFT', async () => {
        const prisma = {
            sdSalesInvoice: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'inv-1',
                        invoiceNumber: 'INV-1',
                        salesOrderId: 'so-1',
                        status: 'ISSUED',
                        currency: 'PHP',
                        totalAmount: '1000',
                        refundedAmount: '0',
                        issuedAt: daysAgo(45),
                        paidAt: null,
                        salesOrder: {
                            orderNumber: 'SO-1',
                            customerName: null,
                            customerEmail: 'a@b.test',
                            shipToName: 'Ana',
                        },
                    },
                ]),
                count: jest
                    .fn()
                    .mockResolvedValueOnce(1) // total
                    .mockResolvedValueOnce(4) // pending
                    .mockResolvedValueOnce(2) // overdue
                    .mockResolvedValueOnce(7), // paid
                aggregate: jest.fn().mockResolvedValue({
                    _sum: { totalAmount: '5000', refundedAmount: '250' },
                }),
            },
        }
        const service = new SalesInvoiceService(prisma as unknown as PrismaService)

        const result = await service.list({ status: 'OVERDUE', search: 'SO-1' }, NOW)

        expect(result.summary).toEqual({
            pendingCount: 4,
            overdueCount: 2,
            paidCount: 7,
            outstandingAmount: 4750,
            currency: 'PHP',
        })
        expect(result.data[0]).toMatchObject({
            salesOrderReference: 'SO-1',
            customerName: 'Ana',
            totalAmount: 1000,
            billingStatus: 'OVERDUE',
            dueDate: daysAgo(15),
        })

        const listWhere = prisma.sdSalesInvoice.findMany.mock.calls[0][0].where
        expect(listWhere.AND[0].status).toEqual({ not: 'DRAFT' })
        expect(listWhere.AND[1]).toEqual(billingStatusWhere('OVERDUE', NOW))
        expect(prisma.sdSalesInvoice.aggregate).toHaveBeenCalledWith({
            where: { AND: [listWhere.AND[0], { status: 'ISSUED' }] },
            _sum: { totalAmount: true, refundedAmount: true },
        })
    })
})

describe('SalesInvoicePdfService', () => {
    it('renders a PDF for an invoice', async () => {
        const input: InvoicePdfInput = {
            invoiceNumber: 'INV-20261014-0001',
            status: 'ISSUED',
            currency: 'PHP',
            issuedAt: daysAgo(40),
            paidAt: null,
            createdAt: daysAgo(40),
            subtotal: '1500',
            discountAmount: '100',
            shippingAmount: '50',
            totalAmount: '1450',
            refundedAmount: '0',
            notes: null,
            salesOrderNumber: 'SO-000001',
            paymentMethod: 'COD',
            billTo: { name: 'Maria Santos', addressLines: ['1 Main St', 'Davao City'] },
            lines: [
                {
                    lineNumber: 1,
                    sku: 'VIT-MULTI-60',
                    description: 'Daily Essentials Multivitamin',
                    variantName: null,
                    quantity: '3',
                    unitPrice: '500',
                    lineTotal: '1500',
                },
            ],
            company: { name: 'AGCTEK', address: 'Davao City', tin: '000-000-000' },
        }

        const bytes = await new SalesInvoicePdfService().render(input, NOW)

        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
        expect(bytes.length).toBeGreaterThan(1000)
    })
})
