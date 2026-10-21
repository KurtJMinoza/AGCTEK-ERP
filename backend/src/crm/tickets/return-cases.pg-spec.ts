/**
 * RMA hand-off (customer return → CRM case → Replacement) against a real PostgreSQL database
 * (`npm run test:pg`, uses DATABASE_URL). Proves what the mocked specs cannot: the unique
 * `crm_tickets.sdReturnRequestId` index keeps one case per return under concurrent hand-offs, and
 * concurrent approvals from CRM leave exactly one MM customer return and one replacement order.
 *
 * Borrows one existing warehouse and material (read-only) and creates its own tagged customer,
 * orders, returns and tickets, deleting them afterwards. The replacement order's MM reservation /
 * picking is stubbed here; it runs in the live replacement run (see docs/COD_DELIVERY_CUSTOMER_RETURNS.md).
 */
import 'reflect-metadata'
import { Prisma, PrismaClient } from '@prisma/client'
import { ReturnRequestService } from '../../sd/return-request.service'
import { SalesOrderService } from '../../sd/sales-order.service'
import { CrmReturnCasesService } from './return-cases.service'

jest.setTimeout(180_000)

const prisma = new PrismaClient()
const tag = `PGRMA-${Date.now()}`
const code = (err: any): string =>
    err?.code ?? err?.response?.code ?? err?.response?.message ?? err?.message
const settle = async <T>(promises: Promise<T>[]) => {
    const results = await Promise.allSettled(promises)
    return {
        ok: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
        errors: results.flatMap((r) => (r.status === 'rejected' ? [code(r.reason)] : [])),
    }
}

describe('RMA hand-off on PostgreSQL', () => {
    const sdEvents = { emit: async () => undefined }
    const salesOrders = new SalesOrderService(
        prisma as never,
        sdEvents as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    )
    jest.spyOn(salesOrders, 'confirm').mockImplementation(async (id: string) =>
        prisma.sdSalesOrder.update({ where: { id }, data: { status: 'CONFIRMED' } }) as never,
    )
    jest.spyOn(salesOrders, 'createReservationAndPickingForSalesOrder').mockResolvedValue(undefined as never)
    const returnRequests = new ReturnRequestService(prisma as never, {} as never, salesOrders)
    const cases = new CrmReturnCasesService(prisma as never, returnRequests)

    let agent: { id: string; role: string }
    let companyId: string
    let warehouseId: string
    let materialId: string
    let customerId: string
    const returnIds: string[] = []
    const orderIds: string[] = []

    beforeAll(async () => {
        const admin =
            (await prisma.user.findFirst({ where: { role: 'super_admin' } })) ??
            (await prisma.user.findFirstOrThrow())
        agent = { id: admin.id, role: admin.role }
        const warehouse = await prisma.warehouse.findFirstOrThrow({ select: { id: true, companyId: true } })
        warehouseId = warehouse.id
        companyId = warehouse.companyId
        const material = await prisma.mmMaterial.findFirstOrThrow({ select: { id: true } })
        materialId = material.id
        const customer = await prisma.sdCustomer.create({
            data: {
                customerNumber: `${tag}-C`,
                companyName: `${tag} customer`,
                contactName: 'PG test',
                email: `${tag.toLowerCase()}@pg-test.invalid`,
                currency: 'PHP',
                status: 'ACTIVE',
            },
        })
        customerId = customer.id
    })

    afterAll(async () => {
        try {
            await prisma.crmTicket.deleteMany({ where: { sdReturnRequestId: { in: returnIds } } })
            await prisma.mmCustomerReturn.deleteMany({ where: { sdReturnRequestRef: { in: returnIds } } })
            const replacements = returnIds.map((id) => `replacement:${id}`)
            await prisma.sdSalesOrder.deleteMany({ where: { idempotencyKey: { in: replacements } } })
            await prisma.sdReturnRequest.deleteMany({ where: { id: { in: returnIds } } })
            await prisma.sdSalesOrder.deleteMany({ where: { id: { in: orderIds } } })
            await prisma.sdCustomer.deleteMany({ where: { id: customerId } })
        } finally {
            await prisma.$disconnect()
        }
    })

    /** A delivered order with one issued line and a REQUESTED replacement return on it. */
    const requestedReturn = async () => {
        const suffix = Math.random().toString(36).slice(2, 8)
        const order = await prisma.sdSalesOrder.create({
            data: {
                orderNumber: `${tag}-${suffix}`,
                companyId,
                warehouseId,
                customerId,
                status: 'DELIVERED',
                correlationId: `${tag}-corr-${suffix}`,
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId,
                            quantity: new Prisma.Decimal(5),
                            baseQuantity: new Prisma.Decimal(5),
                            issuedQuantity: new Prisma.Decimal(5),
                        },
                    ],
                },
            },
            include: { lines: true },
        })
        orderIds.push(order.id)
        const request = await returnRequests.create({
            companyId,
            salesOrderId: order.id,
            customerId,
            reason: 'DAMAGED_ITEM',
            preferredResolution: 'REPLACEMENT',
            lines: [{ salesOrderLineId: order.lines[0].id, quantity: 2 }],
        })
        returnIds.push(request!.id)
        return request!
    }

    it('opens exactly one case when the hand-off is delivered several times at once', async () => {
        const request = await requestedReturn()

        const { ok, errors } = await settle([1, 2, 3, 4, 5].map(() => cases.openForReturn(request.id, null)))

        expect(errors).toEqual([])
        expect(new Set(ok.map((r) => r.ticket.id)).size).toBe(1)
        expect(ok.filter((r) => r.created)).toHaveLength(1)
        const tickets = await prisma.crmTicket.findMany({ where: { sdReturnRequestId: request.id } })
        expect(tickets).toHaveLength(1)
        expect(tickets[0]).toMatchObject({
            customerId,
            category: 'RETURN',
            salesOrderId: request.salesOrderId,
            returnRequestNumber: request.requestNumber,
        })
    })

    it('rejects a second ticket for the same return in the database itself', async () => {
        const request = await requestedReturn()
        const { ticket } = await cases.openForReturn(request.id, null)

        await expect(
            prisma.crmTicket.create({
                data: { customerId, subject: 'duplicate', sdReturnRequestId: request.id },
            }),
        ).rejects.toMatchObject({ code: 'P2002' })
        expect(ticket.sdReturnRequestId).toBe(request.id)
    })

    it('approves a replacement from the case: MM return, $0 replacement order, ticket comment', async () => {
        const request = await requestedReturn()
        const { ticket } = await cases.openForReturn(request.id, null)

        const view = await cases.approveReturn(ticket.id, agent)

        expect(view.status).toBe('AWAITING_RETURN')
        const mm = await prisma.mmCustomerReturn.findMany({
            where: { sdReturnRequestRef: request.id },
            include: { lines: true },
        })
        expect(mm).toHaveLength(1)
        expect(mm[0]).toMatchObject({ returnNumber: `CR-${request.requestNumber}`, status: 'DRAFT', warehouseId })
        expect(mm[0].lines.map((l) => [l.quantity.toString(), l.disposition])).toEqual([['2', 'BLOCK']])
        const replacement = await prisma.sdSalesOrder.findUniqueOrThrow({
            where: { idempotencyKey: `replacement:${request.id}` },
            include: { lines: true },
        })
        expect(replacement).toMatchObject({ status: 'CONFIRMED', customerId, warehouseId, paymentMethod: 'STORE_CREDIT' })
        expect(replacement.totalAmount?.toString()).toBe('0')
        expect(replacement.lines.map((l) => [l.materialId, l.quantity.toString()])).toEqual([[materialId, '2']])
        expect(view.replacementOrder?.id).toBe(replacement.id)
        const linked = await prisma.crmTicket.findUniqueOrThrow({ where: { id: ticket.id } })
        expect(linked).toMatchObject({ sdReturnRequestId: request.id, status: 'OPEN' })
        expect(await prisma.crmTicketComment.count({ where: { ticketId: ticket.id } })).toBe(1)
    })

    it('still lets SD approve a return that has no CRM case (staff-entered)', async () => {
        const request = await requestedReturn()

        await expect(
            returnRequests.approve(request.id, companyId, agent.id, { preferredResolution: 'REPLACEMENT' }),
        ).resolves.toMatchObject({ status: 'AWAITING_RETURN' })
    })

    it('rejects from the case once, with the reason on the return and one ticket comment', async () => {
        const request = await requestedReturn()
        const { ticket } = await cases.openForReturn(request.id, null)

        await expect(returnRequests.approve(request.id, companyId, agent.id)).rejects.toThrow(/has a CRM case/)
        await expect(returnRequests.reject(request.id, companyId, { reason: 'x' })).rejects.toThrow(/has a CRM case/)

        const { ok, errors } = await settle([1, 2].map(() => cases.rejectReturn(ticket.id, 'Outside the return window', agent)))

        expect(errors).toEqual([])
        expect(ok.every((view) => view.status === 'REJECTED')).toBe(true)
        const after = await prisma.sdReturnRequest.findUniqueOrThrow({ where: { id: request.id } })
        expect(after).toMatchObject({ status: 'REJECTED', rejectReason: 'Outside the return window', approvedBy: agent.id })
        expect(await prisma.mmCustomerReturn.count({ where: { sdReturnRequestRef: request.id } })).toBe(0)
        const comments = await prisma.crmTicketComment.findMany({ where: { ticketId: ticket.id } })
        expect(comments.map((c) => c.body)).toEqual([`Return ${request.requestNumber} rejected: Outside the return window`])
    })

    it('leaves one MM return and one replacement order when agents approve at the same time', async () => {
        const request = await requestedReturn()
        const { ticket } = await cases.openForReturn(request.id, null)

        const { ok, errors } = await settle([1, 2, 3].map(() => cases.approveReturn(ticket.id, agent)))

        expect(errors).toEqual([])
        expect(ok.every((view) => view.status === 'AWAITING_RETURN')).toBe(true)
        expect(await prisma.mmCustomerReturn.count({ where: { sdReturnRequestRef: request.id } })).toBe(1)
        expect(
            await prisma.sdSalesOrder.count({ where: { idempotencyKey: `replacement:${request.id}` } }),
        ).toBe(1)
        const after = await prisma.sdReturnRequest.findUniqueOrThrow({ where: { id: request.id } })
        const mm = await prisma.mmCustomerReturn.findFirstOrThrow({ where: { sdReturnRequestRef: request.id } })
        expect(after.mmCustomerReturnId).toBe(mm.id)
        expect(await prisma.crmTicketComment.count({ where: { ticketId: ticket.id } })).toBe(1)
    })
})
