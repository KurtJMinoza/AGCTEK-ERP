/**
 * CRM Closed Won → SD sales order (ECOMMERCE / CRM) acceptance matrix.
 *
 * Runs the real CrmOpportunityHandoffService, CrmOpportunitiesService gates and
 * SalesOrderService against an in-memory store that behaves like Postgres where the
 * handoff depends on it: transactions roll back on error, writers take row / unique-key
 * locks held until commit (READ COMMITTED), and unique indexes raise P2002.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import type { PermissionsService } from '../../permissions/permissions.service'
import type { PrismaService } from '../../prisma/prisma.service'
import { QuotationService } from '../../sd/quotation.service'
import { SalesOrderService } from '../../sd/sales-order.service'
import type { CrmActivitiesService } from '../activities/activities.service'
import { CrmMessagesService } from '../messages/crm-messages.service'
import { CrmOpportunitiesService } from './opportunities.service'
import { CrmOpportunityHandoffService } from './opportunity-handoff.service'

type Row = Record<string, any>

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

const uniqueViolation = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: [field] },
    })

const sameValue = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => sameValue(row[key], value))

class Tx {
    readonly oppWrites = new Map<string, Row>()
    readonly orderInserts: Row[] = []
    readonly releases = new Map<string, () => void>()

    release() {
        this.releases.forEach((release) => release())
    }
}

class FakeDb {
    readonly opps = new Map<string, Row>()
    readonly customers = new Map<string, Row>()
    readonly products = new Map<string, Row>()
    readonly orders: Row[] = []
    private readonly lockTails = new Map<string, Promise<void>>()
    private clock = Date.parse('2026-10-01T00:00:00Z')
    private orderSeq = 0

    now() {
        this.clock += 1000
        return new Date(this.clock)
    }

    private async lock(tx: Tx, key: string) {
        if (tx.releases.has(key)) return
        const previous = this.lockTails.get(key) ?? Promise.resolve()
        let release!: () => void
        const mine = new Promise<void>((resolve) => (release = resolve))
        this.lockTails.set(key, previous.then(() => mine))
        await previous
        tx.releases.set(key, release)
    }

    private ordersVisible(tx?: Tx) {
        return tx ? [...this.orders, ...tx.orderInserts] : this.orders
    }

    private oppVisible(id: string, tx?: Tx) {
        return tx?.oppWrites.get(id) ?? this.opps.get(id)
    }

    private commit(tx: Tx) {
        tx.oppWrites.forEach((row, id) => this.opps.set(id, row))
        this.orders.push(...tx.orderInserts)
    }

    async transaction<T>(fn: (client: unknown) => Promise<T>, tx = new Tx()): Promise<T> {
        try {
            const result = await fn(this.client(tx))
            this.commit(tx)
            return result
        } finally {
            tx.release()
        }
    }

    client(tx?: Tx) {
        const run = <T>(fn: (t: Tx) => Promise<T>) => {
            if (tx) return fn(tx)
            const autocommit = new Tx()
            return this.transaction(() => fn(autocommit), autocommit)
        }
        return {
            $transaction: (fn: (client: unknown) => Promise<unknown>) => this.transaction(fn),
            $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
                run(async (t) => {
                    const sql = strings.join('?')
                    if (!sql.includes('"crm_opportunities"') || !sql.includes('FOR UPDATE')) {
                        throw new Error(`unexpected SQL ${sql}`)
                    }
                    const id = values[0] as string
                    await tick()
                    await this.lock(t, `opp:${id}`)
                    return this.oppVisible(id, t) ? [{ id }] : []
                }),
            sdQuotation: {
                findFirst: async () => null,
                updateMany: async () => ({ count: 0 }),
            },
            crmOpportunity: {
                findUnique: async ({ where }: { where: { id: string } }) => {
                    await tick()
                    const row = this.oppVisible(where.id, tx)
                    return row ? { ...row } : null
                },
                updateMany: ({ where, data }: { where: Row; data: Row }) =>
                    run(async (t) => {
                        await tick()
                        await this.lock(t, `opp:${where.id}`)
                        const row = this.oppVisible(where.id, t)
                        if (!row || !matches(row, where)) return { count: 0 }
                        t.oppWrites.set(where.id, { ...row, ...data, updatedAt: this.now() })
                        return { count: 1 }
                    }),
            },
            sdCustomer: {
                findUnique: async ({ where }: { where: { id: string } }) => {
                    await tick()
                    const row = this.customers.get(where.id)
                    return row ? { ...row } : null
                },
            },
            sdProduct: {
                findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
                    await tick()
                    return where.id.in.flatMap((id) => {
                        const row = this.products.get(id)
                        return row ? [{ ...row }] : []
                    })
                },
            },
            sdSalesOrder: {
                findUnique: async ({ where }: { where: { id?: string; crmOpportunityId?: string } }) => {
                    await tick()
                    const row = this.ordersVisible(tx).find((o) =>
                        where.id ? o.id === where.id : o.crmOpportunityId === where.crmOpportunityId,
                    )
                    return row ? { ...row } : null
                },
                count: async ({ where }: { where: { orderNumber: { startsWith: string } } }) => {
                    await tick()
                    return this.ordersVisible(tx).filter((o) =>
                        String(o.orderNumber).startsWith(where.orderNumber.startsWith),
                    ).length
                },
                create: ({ data }: { data: Row }) =>
                    run(async (t) => {
                        await tick()
                        await this.lock(t, `so:crm:${data.crmOpportunityId}`)
                        await this.lock(t, `so:number:${data.orderNumber}`)
                        const visible = this.ordersVisible(t)
                        if (data.crmOpportunityId && visible.some((o) => o.crmOpportunityId === data.crmOpportunityId)) {
                            throw uniqueViolation('crmOpportunityId')
                        }
                        if (visible.some((o) => o.orderNumber === data.orderNumber)) {
                            throw uniqueViolation('orderNumber')
                        }
                        const { lines, ...rest } = data
                        const row = {
                            id: `so-${++this.orderSeq}`,
                            ...rest,
                            lines: lines.create,
                            createdAt: this.now(),
                        }
                        t.orderInserts.push(row)
                        return { ...row }
                    }),
            },
        }
    }
}

const ACTIVE_CUSTOMER = {
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    companyName: 'BuildRight Hardware Corp',
    email: 'buyer@buildright.test',
    currency: 'PHP',
    status: 'ACTIVE',
}

const product = (id: string, overrides: Row = {}) => ({
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    price: new Decimal('1250.50'),
    divisionId: 'DIV_A',
    isActive: true,
    ...overrides,
})

const user = { id: 'user-1', role: 'sales' }

function setup() {
    const db = new FakeDb()
    db.customers.set(ACTIVE_CUSTOMER.id, { ...ACTIVE_CUSTOMER })
    db.customers.set('cust-usd', { ...ACTIVE_CUSTOMER, id: 'cust-usd', customerNumber: 'CUST-000002', currency: 'USD' })
    db.customers.set('cust-blocked', { ...ACTIVE_CUSTOMER, id: 'cust-blocked', customerNumber: 'CUST-000003', status: 'BLOCKED' })
    db.products.set('p1', product('p1'))
    db.products.set('p2', product('p2', { price: new Decimal('99.99') }))
    db.products.set('p-off', product('p-off', { isActive: false }))

    const prisma = db.client() as unknown as PrismaService
    const quotations = new QuotationService(prisma)
    const salesOrders = new SalesOrderService(
        prisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        quotations,
        {} as never,
    )
    const activities = { withNextActivity: async (rows: unknown[]) => rows } as unknown as CrmActivitiesService
    const messages = { recordSystem: jest.fn().mockResolvedValue({ count: 0 }) } as unknown as CrmMessagesService
    const opportunities = new CrmOpportunitiesService(prisma, activities, quotations, messages)
    jest.spyOn(opportunities, 'findOne').mockImplementation(async (id: string) => {
        const row = db.opps.get(id)
        if (!row) throw new NotFoundException('Opportunity not found')
        return { ...row } as never
    })
    const permissions = { assertPermission: jest.fn().mockResolvedValue(undefined) }
    const service = new CrmOpportunityHandoffService(
        prisma,
        opportunities,
        salesOrders,
        permissions as unknown as PermissionsService,
        quotations,
        messages,
    )

    const addOpportunity = (id: string, overrides: Row = {}) => {
        const row = {
            id,
            name: `Deal ${id}`,
            customerId: ACTIVE_CUSTOMER.id,
            stage: 'NEGOTIATION',
            probability: 75,
            amount: new Decimal('999999'),
            currency: 'PHP',
            expectedCloseDate: new Date('2026-12-31T00:00:00Z'),
            assignedTo: 'owner-1',
            closedAt: null,
            sdSalesOrderId: null,
            updatedAt: db.now(),
            ...overrides,
        }
        db.opps.set(id, row)
        return row
    }

    return { db, service, salesOrders, permissions, addOpportunity }
}

const lines = [
    { productId: 'p1', quantity: 2 },
    { productId: 'p2', quantity: 3 },
]

describe('CRM Closed Won → SD sales order (acceptance matrix)', () => {
    it('happy path: creates one ECOMMERCE / CRM draft priced by SD and commits Closed Won with the link', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')

        const result = await service.win('opp-1', { lines }, user)

        expect(db.orders).toHaveLength(1)
        const [order] = db.orders
        expect(order).toMatchObject({
            channel: 'ECOMMERCE',
            source: 'CRM',
            crmOpportunityId: 'opp-1',
            status: 'DRAFT',
            currency: 'PHP',
            customerId: 'cust-1',
            orderNumber: 'SO-000001',
            salesOwnerId: 'owner-1',
        })
        // 2 × 1250.50 + 3 × 99.99 from the SD catalog; the CRM estimate (999999) is only a note.
        expect(order.totalAmount.toFixed(2)).toBe('2800.97')
        expect(order.notes).toContain('Estimated amount (CRM): PHP 999999.00')

        const opp = db.opps.get('opp-1')!
        expect(opp).toMatchObject({ stage: 'CLOSED_WON', probability: 100, sdSalesOrderId: order.id })
        expect(opp.closedAt).toBeInstanceOf(Date)
        expect(result.created).toBe(true)
        expect(result.salesOrder).toMatchObject({
            id: order.id,
            channel: 'ECOMMERCE',
            source: 'CRM',
            totalAmount: '2800.97',
            lineCount: 2,
        })
    })

    it('double handoff: a second win returns the same order and creates nothing', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')

        const first = await service.win('opp-1', { lines }, user)
        const second = await service.win('opp-1', { lines: [{ productId: 'p2', quantity: 9 }] }, user)

        expect(db.orders).toHaveLength(1)
        expect(second.created).toBe(false)
        expect(second.salesOrder.id).toBe(first.salesOrder.id)
        expect(db.opps.get('opp-1')!.sdSalesOrderId).toBe(first.salesOrder.id)
    })

    it('missed-response retry: an order SD already recorded is linked, not duplicated', async () => {
        const { db, service, salesOrders, addOpportunity } = setup()
        addOpportunity('opp-1', { stage: 'CLOSED_WON', probability: 100 })
        // SD committed the order but CRM never stored the link (response lost before the shared transaction existed).
        await salesOrders.createFromCrmOpportunity({ crmOpportunityId: 'opp-1', customerId: 'cust-1', lines })
        expect(db.orders).toHaveLength(1)

        const result = await service.createSalesOrder('opp-1', { lines }, user)

        expect(db.orders).toHaveLength(1)
        expect(result.created).toBe(false)
        expect(db.opps.get('opp-1')!.sdSalesOrderId).toBe(db.orders[0].id)

        // The client retrying the same win after a lost response also gets the linked order back.
        const again = await service.win('opp-1', { lines }, user)
        expect(again.salesOrder.id).toBe(db.orders[0].id)
        expect(db.orders).toHaveLength(1)
    })

    it('no customer: a missing or inactive SD customer blocks the win and keeps the stage', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-missing', { customerId: 'cust-deleted' })
        addOpportunity('opp-blocked', { customerId: 'cust-blocked' })

        await expect(service.win('opp-missing', { lines }, user)).rejects.toThrow(/requires an active SD customer/)
        await expect(service.win('opp-blocked', { lines }, user)).rejects.toThrow(/requires an active SD customer/)

        expect(db.orders).toHaveLength(0)
        expect(db.opps.get('opp-missing')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null })
        expect(db.opps.get('opp-blocked')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null })
    })

    it('no lines and no quotation: rejected and the stage is kept', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')

        await expect(service.win('opp-1', { lines: [] }, user)).rejects.toThrow(BadRequestException)
        await expect(service.win('opp-1', {}, user)).rejects.toThrow(/At least one SD product line/)

        expect(db.orders).toHaveLength(0)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null })
    })

    it('invalid SKU: unknown or inactive products roll back and keep the stage', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')

        await expect(
            service.win('opp-1', { lines: [{ productId: 'p1', quantity: 1 }, { productId: 'nope', quantity: 1 }] }, user),
        ).rejects.toThrow(/Unknown product\(s\): nope/)
        await expect(service.win('opp-1', { lines: [{ productId: 'p-off', quantity: 1 }] }, user)).rejects.toThrow(
            /Inactive product\(s\): SKU-p-off/,
        )

        expect(db.orders).toHaveLength(0)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null })
    })

    it('currency reject: a customer billed outside the catalog currency is refused, not converted', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1', { customerId: 'cust-usd', currency: 'USD' })

        const attempt = service.win('opp-1', { lines }, user)
        await expect(attempt).rejects.toThrow(BadRequestException)
        await expect(attempt).rejects.toThrow(/billed in USD.*does not convert/)

        expect(db.orders).toHaveLength(0)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null })
    })

    it('existing sdSalesOrderId: never overwritten; re-winning a reopened deal reuses it', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')
        const first = await service.win('opp-1', { lines }, user)
        const linkedId = first.salesOrder.id

        // Reopened after the win: the link stays.
        db.opps.set('opp-1', { ...db.opps.get('opp-1')!, stage: 'NEGOTIATION', closedAt: null, updatedAt: db.now() })

        await expect(service.createSalesOrder('opp-1', { lines }, user)).resolves.toMatchObject({
            created: false,
            salesOrder: { id: linkedId },
        })
        const rewon = await service.win('opp-1', { lines: [{ productId: 'p2', quantity: 1 }] }, user)

        expect(rewon).toMatchObject({ created: false, salesOrder: { id: linkedId } })
        expect(db.orders).toHaveLength(1)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'CLOSED_WON', sdSalesOrderId: linkedId })
    })

    it('concurrent handoffs: parallel wins of one deal create exactly one order and all callers get it', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')

        const results = await Promise.all(
            Array.from({ length: 5 }, () => service.win('opp-1', { lines }, user)),
        )

        expect(db.orders).toHaveLength(1)
        const orderId = db.orders[0].id
        expect(results.map((r) => r.salesOrder.id)).toEqual(Array(5).fill(orderId))
        expect(results.filter((r) => r.created)).toHaveLength(1)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'CLOSED_WON', sdSalesOrderId: orderId })
    })

    it('concurrent handoffs: parallel wins of different deals get distinct order numbers', async () => {
        const { db, service, addOpportunity } = setup()
        addOpportunity('opp-1')
        addOpportunity('opp-2')
        addOpportunity('opp-3')

        await Promise.all(['opp-1', 'opp-2', 'opp-3'].map((id) => service.win(id, { lines }, user)))

        expect(db.orders).toHaveLength(3)
        expect(new Set(db.orders.map((o) => o.orderNumber)).size).toBe(3)
        expect(new Set(db.orders.map((o) => o.crmOpportunityId))).toEqual(new Set(['opp-1', 'opp-2', 'opp-3']))
        for (const id of ['opp-1', 'opp-2', 'opp-3']) {
            const opp = db.opps.get(id)!
            expect(opp.stage).toBe('CLOSED_WON')
            expect(db.orders.find((o) => o.id === opp.sdSalesOrderId)?.crmOpportunityId).toBe(id)
        }
    })

    it('rollback: the SD order is discarded when the opportunity changed during the handoff', async () => {
        const { db, service, salesOrders, addOpportunity } = setup()
        addOpportunity('opp-1')
        const create = salesOrders.createFromCrmOpportunity.bind(salesOrders)
        jest.spyOn(salesOrders, 'createFromCrmOpportunity').mockImplementation(async (input, options) => {
            const order = await create(input, options)
            // Someone edits the opportunity between our read and the link.
            db.opps.set('opp-1', { ...db.opps.get('opp-1')!, name: 'Renamed', updatedAt: db.now() })
            return order
        })

        await expect(service.win('opp-1', { lines }, user)).rejects.toThrow(ConflictException)

        expect(db.orders).toHaveLength(0)
        expect(db.opps.get('opp-1')).toMatchObject({ stage: 'NEGOTIATION', sdSalesOrderId: null, name: 'Renamed' })
    })
})
