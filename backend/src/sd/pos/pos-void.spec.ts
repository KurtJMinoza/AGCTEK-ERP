import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common'
import { PosVoidService } from './pos-void.service'

describe('PosVoidService', () => {
    let service: PosVoidService
    let prisma: any
    let goodsIssue: any
    let sdIntegration: any
    let sdEvents: any

    const order = (overrides: Record<string, unknown> = {}) => ({
        id: 'order-1',
        orderNumber: 'POS-000004',
        receiptNumber: 'RCP-000005',
        status: 'COMPLETED',
        channel: 'POS',
        companyId: 'company-1',
        branchId: 'branch-1',
        posSessionId: 'session-1',
        cashierUserId: 'cashier-1',
        customerId: 'cust-1',
        currency: 'PHP',
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        totalAmount: 7300,
        lines: [{ id: 'line-1' }],
        payments: [{ id: 'pay-1', status: 'Paid' }],
        ...overrides,
    })

    beforeEach(() => {
        prisma = {
            sdSalesOrder: {
                findFirst: jest.fn().mockResolvedValue(order()),
                update: jest.fn().mockResolvedValue(
                    order({
                        status: 'CANCELLED',
                        voidedAt: new Date('2026-11-13T00:00:00.000Z'),
                        voidedBy: 'cashier-1',
                        voidReason: 'Wrong item scanned',
                    }),
                ),
            },
            sdSalesOrderPayment: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            sdSalesOrderLine: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            sdCustomer: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            sdPosVoidTransaction: {
                upsert: jest.fn().mockResolvedValue({
                    voidNumber: 'V-RCP-000005',
                    amount: -7300,
                    reason: 'Wrong item scanned',
                    createdAt: new Date('2026-11-13T00:00:00.000Z'),
                }),
                findUnique: jest.fn().mockResolvedValue(null),
            },
            $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
            mmGoodsIssue: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'gi-1',
                    status: 'POSTED',
                }),
            },
        }
        goodsIssue = {
            reverse: jest.fn().mockResolvedValue({ id: 'gi-1' }),
        }
        sdIntegration = {
            releaseVoidedDemand: jest.fn().mockResolvedValue({
                releasedCount: 1,
            }),
        }
        sdEvents = { emit: jest.fn().mockResolvedValue(undefined) }

        service = new PosVoidService(
            prisma,
            goodsIssue,
            sdIntegration,
            sdEvents,
        )
    })

    it('reverses the goods issue, cancels the tenders and closes the sale', async () => {
        const result = await service.voidSale('order-1', {
            reason: 'Wrong item scanned',
            voidedBy: 'cashier-1',
        })

        expect(goodsIssue.reverse).toHaveBeenCalledWith('gi-1', 'cashier-1')
        expect(sdIntegration.releaseVoidedDemand).toHaveBeenCalledWith('order-1')
        expect(prisma.sdSalesOrderPayment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ salesOrderId: 'order-1' }),
                data: { status: 'Cancelled' },
            }),
        )
        expect(prisma.sdSalesOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'order-1' },
                data: expect.objectContaining({
                    status: 'CANCELLED',
                    voidReason: 'Wrong item scanned',
                }),
            }),
        )
        expect(sdEvents.emit).toHaveBeenCalledWith(
            'PosSaleVoided',
            expect.objectContaining({
                salesOrderId: 'order-1',
                voidTransactionNumber: 'V-RCP-000005',
            }),
        )
        expect(result).toMatchObject({
            status: 'VOIDED',
            voidReason: 'Wrong item scanned',
            tendersCancelled: 1,
            voidTransactionNumber: 'V-RCP-000005',
            voidedAmount: -7300,
        })
    })

    it('records a void transaction that follows the completed sale', async () => {
        await service.voidSale('order-1', {
            reason: 'Wrong item scanned',
            voidedBy: 'cashier-1',
        })

        expect(prisma.sdPosVoidTransaction.upsert).toHaveBeenCalledWith({
            where: { salesOrderId: 'order-1' },
            create: expect.objectContaining({
                voidNumber: 'V-RCP-000005',
                salesOrderId: 'order-1',
                originalReceiptNumber: 'RCP-000005',
                companyId: 'company-1',
                branchId: 'branch-1',
                posSessionId: 'session-1',
                cashierUserId: 'cashier-1',
                currency: 'PHP',
                reason: 'Wrong item scanned',
                voidedBy: 'cashier-1',
            }),
            update: {},
        })
        const [args] = prisma.sdPosVoidTransaction.upsert.mock.calls[0]
        expect(Number(args.create.amount)).toBe(-7300)
    })

    it('does not reverse twice when the sale is already voided', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(
            order({
                status: 'CANCELLED',
                voidedAt: new Date('2026-11-13T00:00:00.000Z'),
                voidReason: 'Already voided',
            }),
        )
        const result = await service.voidSale('order-1', {
            reason: 'Again',
        })
        expect(goodsIssue.reverse).not.toHaveBeenCalled()
        expect(prisma.sdSalesOrder.update).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(prisma.sdPosVoidTransaction.upsert).not.toHaveBeenCalled()
        expect(result).toMatchObject({
            status: 'VOIDED',
            voidReason: 'Already voided',
        })
    })

    it('returns the void transaction of a sale that is voided again', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(
            order({
                status: 'CANCELLED',
                voidedAt: new Date('2026-11-13T00:00:00.000Z'),
                voidReason: 'Wrong item scanned',
            }),
        )
        prisma.sdPosVoidTransaction.findUnique.mockResolvedValue({
            voidNumber: 'V-RCP-000005',
            amount: -7300,
        })

        const result = await service.voidSale('order-1', { reason: 'Again' })

        expect(prisma.sdPosVoidTransaction.findUnique).toHaveBeenCalledWith({
            where: { salesOrderId: 'order-1' },
        })
        expect(result).toMatchObject({
            voidTransactionNumber: 'V-RCP-000005',
            voidedAmount: -7300,
        })
    })

    it('gives the employee credit back when a salary deduction is voided', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(
            order({
                customerId: 'cust-1',
                payments: [
                    {
                        id: 'pay-1',
                        status: 'Paid',
                        paymentMethod: 'SALARY_LOAN',
                        amount: 7300,
                    },
                ],
            }),
        )

        await service.voidSale('order-1', {
            reason: 'Wrong employee',
            voidedBy: 'cashier-1',
        })

        expect(prisma.sdCustomer.updateMany).toHaveBeenCalledTimes(1)
        const [credit] = prisma.sdCustomer.updateMany.mock.calls[0]
        expect(credit.where).toEqual({ id: 'cust-1' })
        expect(Number(credit.data.availableCredit.increment)).toBe(7300)
    })

    it('leaves the credit alone for a sale paid in cash', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(
            order({
                payments: [
                    {
                        id: 'pay-1',
                        status: 'Paid',
                        paymentMethod: 'CASH',
                        amount: 7300,
                    },
                ],
            }),
        )

        await service.voidSale('order-1', { reason: 'Customer changed their mind' })

        expect(prisma.sdCustomer.updateMany).not.toHaveBeenCalled()
    })

    it('refuses a sale that is not completed', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(
            order({ status: 'CANCELLED' }),
        )
        await expect(
            service.voidSale('order-1', { reason: 'Test' }),
        ).rejects.toBeInstanceOf(ConflictException)
    })

    it('requires a reason', async () => {
        await expect(
            service.voidSale('order-1', { reason: '   ' }),
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('fails when the sale does not exist', async () => {
        prisma.sdSalesOrder.findFirst.mockResolvedValue(null)
        await expect(
            service.voidSale('nope', { reason: 'Test' }),
        ).rejects.toBeInstanceOf(NotFoundException)
    })
})
