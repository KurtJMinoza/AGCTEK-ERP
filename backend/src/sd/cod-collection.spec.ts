import { BadRequestException, ConflictException } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import type { PrismaService } from '../prisma/prisma.service'
import { summarizeCodCollection, type CodOrderState } from './cod-collection'
import { SalesOrderService } from './sales-order.service'

type FakeOrder = {
    id: string
    orderNumber: string
    status: string
    paymentMethod: string
    paymentStatus: string
    currency: string
    payment: { id: string; status: string; amount: Decimal; paidAt: Date | null } | null
}

function setup(orders: FakeOrder[]) {
    const byId = new Map(orders.map((o) => [o.id, o]))
    const tx = {
        sdSalesOrder: {
            findMany: jest.fn(async ({ where }: { where: { id: { in: string[] }; paymentMethod: string } }) =>
                where.id.in
                    .map((id) => byId.get(id))
                    .filter((o): o is FakeOrder => !!o && o.paymentMethod === where.paymentMethod)
                    .map((o) => ({
                        ...o,
                        payments: o.payment
                            ? [{ ...o.payment, currency: o.currency }]
                            : [],
                    })),
            ),
            update: jest.fn(async ({ where, data }: { where: { id: string }; data: { paymentStatus: string } }) => {
                byId.get(where.id)!.paymentStatus = data.paymentStatus
            }),
        },
        sdSalesOrderPayment: {
            findMany: jest.fn(async ({ where }: { where: { salesOrderId: { in: string[] } } }) =>
                where.salesOrderId.in
                    .map((id) => byId.get(id))
                    .filter((o): o is FakeOrder => !!o?.payment)
                    .map((o) => ({ ...o.payment!, salesOrderId: o.id })),
            ),
            update: jest.fn(
                async ({ where, data }: { where: { id: string }; data: { amount: number } }) => {
                    const order = orders.find((o) => o.payment?.id === where.id)
                    if (order?.payment && data.amount != null) {
                        order.payment.amount = new Decimal(data.amount)
                    }
                    return order?.payment
                },
            ),
            updateMany: jest.fn(
                async ({ where, data }: { where: { id: string; status: string }; data: { status: string; paidAt: Date | null } }) => {
                    const order = orders.find((o) => o.payment?.id === where.id)
                    if (!order?.payment || order.payment.status !== where.status) return { count: 0 }
                    order.payment.status = data.status
                    order.payment.paidAt = data.paidAt
                    return { count: 1 }
                },
            ),
        },
    }
    const prisma = {
        ...tx,
        sdSalesOrderPayment: tx.sdSalesOrderPayment,
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    }
    const invoices = { markPaidForSalesOrder: jest.fn().mockResolvedValue({ count: 1 }) }
    const service = new SalesOrderService(
        prisma as unknown as PrismaService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        invoices as never,
    )
    const release = jest
        .spyOn(
            service as unknown as { createReservationAndPickingForSalesOrder: (id: string) => Promise<unknown> },
            'createReservationAndPickingForSalesOrder',
        )
        .mockResolvedValue(undefined)
    return { service, prisma, invoices, release, byId }
}

const codOrder = (id: string, amount: number, over: Partial<FakeOrder> = {}): FakeOrder => ({
    id,
    orderNumber: `SO-${id}`,
    status: 'SHIPPED',
    paymentMethod: 'COD',
    paymentStatus: 'Pending Collection',
    currency: 'PHP',
    payment: { id: `pay-${id}`, status: 'Pending Collection', amount: new Decimal(amount), paidAt: null },
    ...over,
})

describe('summarizeCodCollection', () => {
    const state = (over: Partial<CodOrderState>): CodOrderState => ({
        salesOrderId: 'so-1',
        orderNumber: 'SO-1',
        orderStatus: 'SHIPPED',
        paymentStatus: 'Pending Collection',
        amount: 100,
        currency: 'PHP',
        paidAt: null,
        ...over,
    })

    it('is null when no order is COD', () => {
        expect(summarizeCodCollection([])).toBeNull()
    })

    it('sums outstanding cash in cents without float drift', () => {
        const summary = summarizeCodCollection([
            state({ amount: 0.1 }),
            state({ salesOrderId: 'so-2', amount: 0.2 }),
        ])
        expect(summary).toMatchObject({ status: 'PENDING', amountDue: 0.3, amountCollected: 0 })
    })

    it('reports a missing amount as null amountDue', () => {
        expect(summarizeCodCollection([state({ amount: null })])!.amountDue).toBeNull()
    })

    it('COLLECTED when every order is Paid', () => {
        const paidAt = new Date('2026-10-02T03:00:00Z')
        expect(summarizeCodCollection([state({ paymentStatus: 'Paid', paidAt })])).toMatchObject({
            status: 'COLLECTED',
            amountDue: 0,
            amountCollected: 100,
            collectedAt: paidAt,
        })
    })
})

describe('SalesOrderService.collectCashOnDelivery', () => {
    it('collects in full: payment Paid, posted invoice PAID, change returned', async () => {
        const { service, invoices, release, byId } = setup([codOrder('a', 1250.5)])

        const result = await service.collectCashOnDelivery(['a'], 1300)

        expect(byId.get('a')!.payment!.status).toBe('Paid')
        expect(byId.get('a')!.paymentStatus).toBe('Paid')
        expect(invoices.markPaidForSalesOrder).toHaveBeenCalledWith('a', expect.any(Date))
        expect(release).toHaveBeenCalledWith('a')
        expect(result).toMatchObject({
            status: 'COLLECTED',
            amountDue: 1250.5,
            amountReceived: 1300,
            change: 49.5,
            collectedOrderIds: ['a'],
        })
    })

    it('sums every COD order on the stop', async () => {
        const { service } = setup([codOrder('a', 100), codOrder('b', 50)])
        const result = await service.collectCashOnDelivery(['a', 'b'], 150)
        expect(result).toMatchObject({ amountDue: 150, change: 0, collectedOrderIds: ['a', 'b'] })
    })

    it('rejects less than the amount due without changes', async () => {
        const { service, byId, invoices } = setup([codOrder('a', 500)])
        await expect(service.collectCashOnDelivery(['a'], 499.99)).rejects.toThrow(/less than the amount due/)
        expect(byId.get('a')!.payment!.status).toBe('Pending Collection')
        expect(invoices.markPaidForSalesOrder).not.toHaveBeenCalled()
    })

    it('accepts a POD amountDue override and reduces the payment amount', async () => {
        const { service, byId } = setup([codOrder('a', 1299)])
        const result = await service.collectCashOnDelivery(['a'], 1039.2, { amountDue: 1039.2 })
        expect(Number(byId.get('a')!.payment!.amount)).toBe(1039.2)
        expect(result).toMatchObject({
            status: 'COLLECTED',
            amountDue: 1039.2,
            amountReceived: 1039.2,
            change: 0,
            collectedOrderIds: ['a'],
        })
    })

    it('rejects an amountDue override above the original payment', async () => {
        const { service } = setup([codOrder('a', 100)])
        await expect(
            service.collectCashOnDelivery(['a'], 150, { amountDue: 150 }),
        ).rejects.toThrow(/cannot exceed the order payment/)
    })

    it('rejects a non-COD stop with 400', async () => {
        const { service } = setup([codOrder('a', 100, { paymentMethod: 'CARD_DEMO' })])
        await expect(service.collectCashOnDelivery(['a'], 100)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a COD order without an amount due with 400', async () => {
        const { service } = setup([codOrder('a', 0, { payment: null })])
        await expect(service.collectCashOnDelivery(['a'], 100)).rejects.toThrow(/Amount due is missing/)
    })

    it('rejects a cancelled order with 409', async () => {
        const { service } = setup([codOrder('a', 100, { status: 'CANCELLED' })])
        await expect(service.collectCashOnDelivery(['a'], 100)).rejects.toBeInstanceOf(ConflictException)
    })

    it('double submit returns the same collected state and does not re-post', async () => {
        const { service, invoices } = setup([codOrder('a', 100)])
        await service.collectCashOnDelivery(['a'], 100)
        invoices.markPaidForSalesOrder.mockClear()

        const replay = await service.collectCashOnDelivery(['a'], 100)

        expect(replay).toMatchObject({ status: 'COLLECTED', collectedOrderIds: [], amountReceived: null })
        expect(invoices.markPaidForSalesOrder).not.toHaveBeenCalled()
    })
})
