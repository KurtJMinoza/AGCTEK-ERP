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

    describe('SalesInvoicePaid hand-off (CRM loyalty)', () => {
        const paidAt = new Date('2026-10-10T08:30:00.000Z')
        const paidInvoice = {
            id: 'inv-1',
            invoiceNumber: 'INV-20261014-0001',
            companyId: 'comp-1',
            currency: 'PHP',
            totalAmount: { toString: () => '2549.99' },
            salesOrder: { customerId: 'shop-1' },
        }

        it('announces the invoice it moved to PAID, once per invoice', async () => {
            const sdEvents = { emit: jest.fn().mockResolvedValue(undefined) }
            service = new SalesInvoiceService(prisma as unknown as PrismaService, sdEvents as never)
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesInvoice.findUnique.mockResolvedValue(paidInvoice)

            await service.markPaidForSalesOrder('so-1', paidAt)

            expect(sdEvents.emit).toHaveBeenCalledWith('SalesInvoicePaid', {
                salesInvoiceId: 'inv-1',
                invoiceNumber: 'INV-20261014-0001',
                salesOrderId: 'so-1',
                customerId: 'shop-1',
                companyId: 'comp-1',
                currency: 'PHP',
                totalAmount: '2549.99',
                paidAt: paidAt.toISOString(),
                idempotencyKey: 'inv-1',
            })
        })

        it('stays silent when nothing changed (draft, already paid or no invoice)', async () => {
            const sdEvents = { emit: jest.fn() }
            service = new SalesInvoiceService(prisma as unknown as PrismaService, sdEvents as never)
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 0 })

            await service.markPaidForSalesOrder('so-1', paidAt)

            expect(sdEvents.emit).not.toHaveBeenCalled()
        })

        it('never fails the payment when the hand-off fails', async () => {
            const sdEvents = { emit: jest.fn().mockRejectedValue(new Error('loyalty down')) }
            service = new SalesInvoiceService(prisma as unknown as PrismaService, sdEvents as never)
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesInvoice.findUnique.mockResolvedValue(paidInvoice)

            await expect(service.markPaidForSalesOrder('so-1', paidAt)).resolves.toEqual({ count: 1 })
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

        it('posts the full invoice — lines are never rewritten at POD (full payment)', async () => {
            prisma.sdSalesInvoice.findUnique
                .mockResolvedValueOnce({ id: 'inv-1', status: 'DRAFT', lines: [] })
                .mockResolvedValueOnce({ id: 'inv-1', status: 'ISSUED' })
            prisma.sdSalesInvoice.updateMany.mockResolvedValue({ count: 1 })
            prisma.sdSalesOrder.findUnique.mockResolvedValue({
                paymentStatus: 'Pending Collection',
                payments: [],
            })

            await service.issueForSalesOrder('so-1')

            expect(prisma.sdSalesInvoiceLine.update).not.toHaveBeenCalled()
            expect(prisma.tripStopShipment.findMany).not.toHaveBeenCalled()
            expect(prisma.sdSalesInvoice.updateMany).toHaveBeenCalledWith({
                where: { id: 'inv-1', status: 'DRAFT' },
                data: { status: 'ISSUED', issuedAt: expect.any(Date) },
            })
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
