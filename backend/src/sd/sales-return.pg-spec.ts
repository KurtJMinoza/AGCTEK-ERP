/**
 * SD Sales Return concurrency against a real PostgreSQL database (`npm run test:pg`, uses
 * DATABASE_URL). Proves what the mocked unit specs cannot: the unique `damageReportId` index
 * makes a retried handoff produce exactly one return, and the `FOR UPDATE` row lock on the
 * order line serializes concurrent returns so the remaining returnable quantity can never be
 * over-claimed. Creates its own tagged company/customer/orders and deletes them afterwards.
 */
import 'reflect-metadata'
import { Prisma, PrismaClient } from '@prisma/client'
import { SalesReturnService } from './sales-return.service'

jest.setTimeout(180_000)

const prisma = new PrismaClient()
const tag = `PGSR-${Date.now()}`
const code = (err: any): string =>
    err?.code ?? err?.response?.code ?? err?.response?.message ?? err?.message
const settle = async <T>(promises: Promise<T>[]) => {
    const results = await Promise.allSettled(promises)
    return {
        ok: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
        errors: results.flatMap((r) =>
            r.status === 'rejected' ? [code(r.reason)] : [],
        ),
    }
}

describe('SD sales returns on PostgreSQL', () => {
    const allow = { assertPermission: async () => undefined }
    const returns = new SalesReturnService(
        prisma as never,
        allow as never,
        {} as never,
    )
    let actor: { id: string; role: string }
    let companyId: string
    let customerId: string

    beforeAll(async () => {
        const admin =
            (await prisma.user.findFirst({ where: { role: 'super_admin' } })) ??
            (await prisma.user.findFirstOrThrow())
        actor = { id: admin.id, role: admin.role }
        const company = await prisma.company.create({
            data: { code: `${tag}-CO`, name: `${tag} company` },
        })
        companyId = company.id
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
            await prisma.sdSalesReturn.deleteMany({ where: { companyId } })
            await prisma.sdSalesOrder.deleteMany({ where: { customerId } })
            await prisma.sdCustomer.deleteMany({ where: { id: customerId } })
            await prisma.company.deleteMany({ where: { id: companyId } })
        } finally {
            await prisma.$disconnect()
        }
    })

    const newOrder = async (quantity: string) => {
        const order = await prisma.sdSalesOrder.create({
            data: {
                orderNumber: `${tag}-${Math.random().toString(36).slice(2, 8)}`,
                companyId,
                customerId,
                status: 'CONFIRMED',
                correlationId: `${tag}-corr-${Math.random().toString(36).slice(2, 8)}`,
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            quantity: new Prisma.Decimal(quantity),
                        },
                    ],
                },
            },
            include: { lines: true },
        })
        return { order, lineId: order.lines[0].id }
    }

    const activeReturnedQty = async (salesOrderLineId: string) => {
        const total = await prisma.sdSalesReturnLine.aggregate({
            where: {
                salesOrderLineId,
                salesReturn: { status: { notIn: ['CANCELLED', 'REJECTED'] } },
            },
            _sum: { quantity: true },
        })
        return Number(total._sum.quantity ?? 0)
    }

    it('produces exactly one return when the same damage report is handed off twice concurrently', async () => {
        const { order, lineId } = await newOrder('10')
        const damageReportId = `${tag}-DR-1`
        const dto = {
            salesOrderId: order.id,
            companyId,
            damageReportId,
            lines: [{ salesOrderLineId: lineId, quantity: 3 }],
        }

        const { ok, errors } = await settle([
            returns.create(dto, actor),
            returns.create(dto, actor),
        ])

        expect(ok).toHaveLength(1)
        expect(errors).toEqual(['P2002'])
        expect(
            await prisma.sdSalesReturn.count({ where: { damageReportId } }),
        ).toBe(1)
    })

    it('serializes concurrent returns so the order line is never over-returned', async () => {
        const { order, lineId } = await newOrder('10')
        const base = { salesOrderId: order.id, companyId }

        const { ok, errors } = await settle([
            returns.create(
                {
                    ...base,
                    damageReportId: `${tag}-DR-A`,
                    lines: [{ salesOrderLineId: lineId, quantity: 6 }],
                },
                actor,
            ),
            returns.create(
                {
                    ...base,
                    damageReportId: `${tag}-DR-B`,
                    lines: [{ salesOrderLineId: lineId, quantity: 6 }],
                },
                actor,
            ),
        ])

        expect(ok).toHaveLength(1)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/exceeds the returnable quantity/)
        expect(await activeReturnedQty(lineId)).toBe(6)
    })
})
