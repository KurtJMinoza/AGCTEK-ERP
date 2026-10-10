/**
 * SD quotations against a real PostgreSQL database (`npm run test:pg`, uses DATABASE_URL).
 *
 * Proves what the unit specs can only mock: the partial unique index
 * `sd_quotations_one_active_per_opportunity`, the `sd_quotation_number_seq` sequence,
 * transaction rollback, and the opportunity / quotation row locks under concurrency.
 * Creates its own tagged customers, products and opportunities and deletes them afterwards;
 * consumed sequence values are not reset (gaps are expected).
 */
import 'reflect-metadata'
import { Prisma, PrismaClient } from '@prisma/client'
import { CrmActivitiesService } from '../crm/activities/activities.service'
import { CrmMessagesService } from '../crm/messages/crm-messages.service'
import { CrmOpportunitiesService } from '../crm/opportunities/opportunities.service'
import { CrmOpportunityHandoffService } from '../crm/opportunities/opportunity-handoff.service'
import { CrmOpportunityQuotationsService } from '../crm/opportunities/opportunity-quotations.service'
import { QuotationService } from './quotation.service'
import { SalesOrderService } from './sales-order.service'

jest.setTimeout(180_000)

const prisma = new PrismaClient()
const tag = `PGQ-${Date.now()}`
const code = (err: any): string => err?.response?.code ?? err?.response?.message ?? err?.message
const settle = async <T>(calls: Promise<T>[]) => {
    const results = await Promise.allSettled(calls)
    return {
        ok: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
        errors: results.flatMap((r) => (r.status === 'rejected' ? [code(r.reason)] : [])),
    }
}

describe('SD quotations on PostgreSQL', () => {
    const customerIds: string[] = []
    const productIds: string[] = []
    const oppIds: string[] = []
    let user: { id: string; role: string }
    let customer: string
    let otherCustomer: string
    let lines: { productId: string; quantity: number }[]
    let quotations: QuotationService
    let opps: CrmOpportunitiesService
    let salesOrders: SalesOrderService
    let handoff: CrmOpportunityHandoffService
    let oppQuotes: CrmOpportunityQuotationsService

    const newOpp = async (name: string, stage: 'PROSPECTING' | 'PROPOSAL' = 'PROPOSAL') => {
        const opp = await opps.create(
            { customerId: customer, name: `${tag} ${name}`, amount: 5000, expectedCloseDate: new Date('2030-12-31'), stage },
            user.id,
        )
        oppIds.push(opp.id)
        return opp.id
    }
    const sentQuote = async (oppId: string) => {
        const quote = await oppQuotes.create(oppId, { lines }, user)
        return quotations.send(quote.id, {}, user.id)
    }
    const setPrice = (index: number, price: string) =>
        prisma.sdProduct.update({ where: { id: productIds[index] }, data: { price: new Prisma.Decimal(price) } })

    beforeAll(async () => {
        const admin =
            (await prisma.user.findFirst({ where: { role: 'super_admin' } })) ?? (await prisma.user.findFirstOrThrow())
        user = { id: admin.id, role: admin.role }
        for (const suffix of ['A', 'B']) {
            const row = await prisma.sdCustomer.create({
                data: {
                    customerNumber: `${tag}-${suffix}`,
                    companyName: `${tag} customer ${suffix}`,
                    contactName: 'PG test',
                    email: `${tag.toLowerCase()}-${suffix.toLowerCase()}@pg-test.invalid`,
                    currency: 'PHP',
                    status: 'ACTIVE',
                },
            })
            customerIds.push(row.id)
        }
        ;[customer, otherCustomer] = customerIds
        for (const [i, price] of ['1250.50', '99.99'].entries()) {
            const product = await prisma.sdProduct.create({
                data: { divisionId: 'DIV_RETAIL', sku: `${tag}-${i}`, name: `PG test ${i}`, price: new Prisma.Decimal(price), category: 'TEST' },
            })
            productIds.push(product.id)
        }
        lines = [
            { productId: productIds[0], quantity: 2 },
            { productId: productIds[1], quantity: 3 },
        ]

        const allow = { assertPermission: async () => undefined }
        quotations = new QuotationService(prisma as never)
        const messages = new CrmMessagesService(prisma as never, new CrmActivitiesService(prisma as never), quotations, {} as never)
        opps = new CrmOpportunitiesService(prisma as never, new CrmActivitiesService(prisma as never), quotations, messages)
        salesOrders = new SalesOrderService(prisma as never, {} as never, {} as never, {} as never, {} as never, quotations)
        handoff = new CrmOpportunityHandoffService(prisma as never, opps, salesOrders, allow as never, quotations, messages)
        oppQuotes = new CrmOpportunityQuotationsService(prisma as never, quotations, allow as never)
    })

    afterAll(async () => {
        try {
            await prisma.sdSalesOrder.deleteMany({ where: { crmOpportunityId: { in: oppIds } } })
            const quotes = await prisma.sdQuotation.findMany({
                where: { OR: [{ crmOpportunityId: { in: oppIds } }, { customerId: { in: customerIds } }] },
                select: { id: true },
            })
            const ids = quotes.map((q) => q.id)
            await prisma.sdQuotation.updateMany({ where: { id: { in: ids } }, data: { previousRevisionId: null } })
            await prisma.sdQuotation.deleteMany({ where: { id: { in: ids } } })
            await prisma.crmOpportunity.deleteMany({ where: { id: { in: oppIds } } })
            await prisma.sdProduct.deleteMany({ where: { id: { in: productIds } } })
            await prisma.sdCustomer.deleteMany({ where: { id: { in: customerIds } } })
        } finally {
            await prisma.$disconnect()
        }
    })

    it('enforces one active quotation per opportunity in the database itself', async () => {
        const base = {
            crmOpportunityId: `${tag}-raw`,
            customerId: customer,
            createdBy: user.id,
        }
        await prisma.sdQuotation.create({ data: { ...base, quotationNumber: `${tag}-RAW`, revision: 1, status: 'DRAFT' } })
        await expect(
            prisma.sdQuotation.create({ data: { ...base, quotationNumber: `${tag}-RAW`, revision: 2, status: 'SENT' } }),
        ).rejects.toMatchObject({ code: 'P2002' })
        await expect(
            prisma.sdQuotation.create({ data: { ...base, quotationNumber: `${tag}-RAW`, revision: 3, status: 'CANCELLED' } }),
        ).resolves.toMatchObject({ status: 'CANCELLED' })
    })

    it('numbers concurrent quotations from the sequence without duplicates', async () => {
        const created = await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                quotations.create({ crmOpportunityId: `${tag}-seq-${i}`, customerId: customer, lines, createdBy: user.id }),
            ),
        )
        const numbers = created.map((q) => q.quotationNumber)
        expect(new Set(numbers).size).toBe(8)
        expect(numbers.every((n) => /^Q-\d{6,}$/.test(n))).toBe(true)
        expect(created.every((q) => q.revision === 1 && q.status === 'DRAFT')).toBe(true)
    })

    it('lets exactly one of several simultaneous quotation creations win', async () => {
        const opp = await newOpp('concurrent-create')
        const { ok, errors } = await settle([1, 2, 3, 4].map(() => oppQuotes.create(opp, { lines }, user)))
        expect(ok).toHaveLength(1)
        expect(errors).toEqual(['QUOTATION_ACTIVE_EXISTS', 'QUOTATION_ACTIVE_EXISTS', 'QUOTATION_ACTIVE_EXISTS'])
        expect(await prisma.sdQuotation.count({ where: { crmOpportunityId: opp } })).toBe(1)
    })

    it('guards the opportunity: stage gate, draft win, lines bypass and customer change', async () => {
        const opp = await newOpp('guards', 'PROSPECTING')
        expect(await oppQuotes.create(opp, { lines }, user).catch(code)).toMatch(/Proposal or Negotiation/)
        await opps.update(opp, { stage: 'PROPOSAL' }, user.id)
        const draft = await oppQuotes.create(opp, { lines }, user)
        expect(draft).toMatchObject({ status: 'DRAFT', customerId: customer, crmOpportunityId: opp })
        expect(await handoff.win(opp, {}, user).catch(code)).toBe('QUOTATION_DRAFT_PENDING')
        expect(await opps.update(opp, { customerId: otherCustomer }, user.id).catch(code)).toBe('QUOTATION_ACTIVE')
        await quotations.send(draft.id, {}, user.id)
        expect(await handoff.win(opp, { lines }, user).catch(code)).toBe('QUOTATION_ACTIVE')
        expect(await handoff.win(opp, { lines, quotationId: draft.id }, user).catch(code)).toBe(
            'Send either a quotation or lines, not both',
        )
        expect(await prisma.sdSalesOrder.count({ where: { crmOpportunityId: opp } })).toBe(0)
    })

    it('converts the sent quotation at frozen prices for six concurrent wins, then refuses new quotations', async () => {
        const opp = await newOpp('wins')
        const quote = await sentQuote(opp)
        await setPrice(0, '1.00')
        await prisma.sdProduct.update({ where: { id: productIds[1] }, data: { isActive: false } })
        try {
            const { ok, errors } = await settle([1, 2, 3, 4, 5, 6].map(() => handoff.win(opp, {}, user)))
            expect(errors).toEqual([])
            expect(ok).toHaveLength(6)
            expect(new Set(ok.map((r) => r.salesOrder.id)).size).toBe(1)
            expect(ok.filter((r) => r.created)).toHaveLength(1)
        } finally {
            await setPrice(0, '1250.50')
            await prisma.sdProduct.update({ where: { id: productIds[1] }, data: { isActive: true } })
        }

        const orders = await prisma.sdSalesOrder.findMany({
            where: { crmOpportunityId: opp },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
        })
        expect(orders).toHaveLength(1)
        const [order] = orders
        expect(order).toMatchObject({ quotationId: quote.id, status: 'DRAFT', channel: 'ECOMMERCE', source: 'CRM' })
        expect(order.totalAmount?.toFixed(2)).toBe('2800.97')
        expect(order.lines.map((l) => l.unitPrice?.toFixed(2))).toEqual(['1250.50', '99.99'])
        const won = await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: opp } })
        expect(won).toMatchObject({ stage: 'CLOSED_WON', sdSalesOrderId: order.id })
        expect(await quotations.findOne(quote.id)).toMatchObject({ status: 'CONVERTED', convertedBy: user.id })

        expect(await oppQuotes.create(opp, { lines }, user).catch(code)).toMatch(/Proposal or Negotiation/)
        await opps.update(opp, { stage: 'PROPOSAL' }, user.id)
        expect(await oppQuotes.create(opp, { lines }, user).catch(code)).toMatch(/already has its SD sales order/)
        expect(await prisma.sdQuotation.count({ where: { crmOpportunityId: opp } })).toBe(1)
    })

    it('rolls the conversion claim back when SD refuses the order', async () => {
        const opp = await newOpp('rollback')
        const quote = await sentQuote(opp)
        await quotations.accept(quote.id, {}, user.id)
        await prisma.sdCustomer.update({ where: { id: customer }, data: { status: 'BLOCKED' } })
        try {
            await expect(
                salesOrders.createFromCrmOpportunity({ crmOpportunityId: opp, customerId: customer, quotationId: quote.id }),
            ).rejects.toBeDefined()
        } finally {
            await prisma.sdCustomer.update({ where: { id: customer }, data: { status: 'ACTIVE' } })
        }
        const after = await prisma.sdQuotation.findUniqueOrThrow({ where: { id: quote.id } })
        expect(after).toMatchObject({ status: 'ACCEPTED', convertedAt: null, convertedBy: null })
        expect(await prisma.sdSalesOrder.count({ where: { crmOpportunityId: opp } })).toBe(0)
    })

    it('cancels the active quotation when the opportunity is closed as lost', async () => {
        const opp = await newOpp('lost')
        const quote = await sentQuote(opp)
        await opps.update(opp, { stage: 'CLOSED_LOST', lostReason: 'PRICE' }, user.id)
        expect(await quotations.findOne(quote.id)).toMatchObject({
            status: 'CANCELLED',
            cancelReason: 'Opportunity closed as lost (PRICE)',
            cancelledBy: user.id,
        })
        await opps.update(opp, { customerId: otherCustomer }, user.id)
        expect((await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: opp } })).customerId).toBe(otherCustomer)
    })

    it('expires an overdue quotation, allows a new one, and wins with direct lines without a quotation', async () => {
        const opp = await newOpp('expired')
        const quote = await sentQuote(opp)
        await prisma.sdQuotation.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() - 60_000) } })
        expect(await handoff.win(opp, { quotationId: quote.id }, user).catch(code)).toBe('QUOTATION_EXPIRED')
        expect((await prisma.sdQuotation.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('EXPIRED')

        const fresh = await oppQuotes.create(opp, { lines }, user)
        expect(fresh).toMatchObject({ status: 'DRAFT', revision: 1 })
        await quotations.cancel(fresh.id, { reason: 'ordering from catalog' }, user.id)

        const result = await handoff.win(opp, { lines }, user)
        expect(result.created).toBe(true)
        const order = await prisma.sdSalesOrder.findFirstOrThrow({ where: { crmOpportunityId: opp } })
        expect(order.quotationId).toBeNull()
        expect(await quotations.revise(quote.id, { reason: 'CUSTOMER_REQUEST' }, user.id).catch(code)).toBe(
            'QUOTATION_OPPORTUNITY_ORDERED',
        )
    })

    it('converts the accepted quotation once for concurrent Retry ERP handoff calls', async () => {
        const opp = await newOpp('retry')
        const quote = await sentQuote(opp)
        await quotations.accept(quote.id, {}, user.id)
        await prisma.crmOpportunity.update({ where: { id: opp }, data: { stage: 'CLOSED_WON', closedAt: new Date() } })
        const { ok, errors } = await settle([1, 2, 3].map(() => handoff.createSalesOrder(opp, {}, user)))
        expect(errors).toEqual([])
        expect(new Set(ok.map((r) => r.salesOrder.id)).size).toBe(1)
        const orders = await prisma.sdSalesOrder.findMany({ where: { crmOpportunityId: opp } })
        expect(orders).toHaveLength(1)
        expect(orders[0].quotationId).toBe(quote.id)
        expect((await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: opp } })).sdSalesOrderId).toBe(orders[0].id)
    })

    it('creates exactly one revision when a rejected quotation is revised concurrently', async () => {
        const opp = await newOpp('revise')
        const quote = await sentQuote(opp)
        await quotations.reject(quote.id, { reason: 'price' }, user.id)
        const { ok, errors } = await settle([1, 2, 3].map(() => quotations.revise(quote.id, { reason: 'ERROR_CORRECTION' }, user.id)))
        expect(ok).toHaveLength(1)
        expect(errors.every((e) => ['QUOTATION_ALREADY_REVISED', 'QUOTATION_ACTIVE_EXISTS'].includes(e))).toBe(true)
        expect(ok[0]).toMatchObject({ revision: 2, quotationNumber: quote.quotationNumber, status: 'DRAFT' })
        expect((await quotations.findOne(quote.id)).status).toBe('REJECTED')
    })

    it('never leaves an active quotation on a lost opportunity or for another customer (lock races)', async () => {
        for (let round = 0; round < 5; round++) {
            const lost = await newOpp(`race-lost-${round}`)
            await settle<unknown>([
                oppQuotes.create(lost, { lines }, user),
                opps.update(lost, { stage: 'CLOSED_LOST', lostReason: 'PRICE' }, user.id),
            ])
            const lostRow = await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: lost } })
            const lostActive = await quotations.findActiveForOpportunity(prisma as never, lost)
            expect(lostRow.stage === 'CLOSED_LOST' && lostActive).toBeFalsy()

            const moved = await newOpp(`race-customer-${round}`)
            await settle<unknown>([
                oppQuotes.create(moved, { lines }, user),
                opps.update(moved, { customerId: otherCustomer }, user.id),
            ])
            const movedRow = await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: moved } })
            const movedActive = await quotations.findActiveForOpportunity(prisma as never, moved)
            if (movedActive) expect(movedActive.customerId).toBe(movedRow.customerId)
        }
    })
})
