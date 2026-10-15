import { ModuleActivityService } from './module-activity.service'
import {
    ACTIVITY_SOURCES,
    BASELINE_SEEN_KEY,
    moduleSeenKey,
} from './module-activity.registry'

const T0 = new Date('2026-10-01T00:00:00Z')
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)

const READ = { canRead: true, canCreate: false, canUpdate: false, canDelete: false }

/** Each fake model holds record creation times; `count` filters by `createdAt > gt`. */
function setup(options: {
    readable: string[]
    records: Record<string, Date[]>
    seen: Record<string, Date>
}) {
    const models: Record<string, { count: jest.Mock }> = {}
    for (const source of ACTIVITY_SOURCES) {
        const times = options.records[source.model] ?? []
        models[source.model] = {
            count: jest.fn(async ({ where }) =>
                times.filter((t) => t > where.createdAt.gt).length,
            ),
        }
    }
    const userModuleSeen = {
        findMany: jest.fn(async () =>
            Object.entries(options.seen).map(([key, seenAt]) => ({ key, seenAt })),
        ),
        upsert: jest.fn(async ({ create }) => create),
    }
    const prisma = {
        ...models,
        userModuleSeen,
        $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    }
    const permissions = {
        resolveForUser: jest.fn(async () => ({
            role: 'clerk',
            permissions: {
                modules: {},
                resources: Object.fromEntries(options.readable.map((code) => [code, READ])),
            },
        })),
    }
    const service = new ModuleActivityService(prisma as never, permissions as never)
    return { service, prisma, userModuleSeen }
}

describe('ModuleActivityService', () => {
    it('registers each model at most once per module so totals do not double count', () => {
        const seen = new Set<string>()
        for (const { module, model } of ACTIVITY_SOURCES) {
            const key = `${module}:${model}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
        }
    })

    it('counts records created after the page was last opened', async () => {
        const { service } = setup({
            readable: ['sd.sales-orders'],
            records: { sdSalesOrder: [at(5), at(20), at(30)] },
            seen: { [BASELINE_SEEN_KEY]: T0, '/modules/sd/sales-orders': at(10) },
        })

        const summary = await service.summary('user-1')

        expect(summary.pages['/modules/sd/sales-orders']).toBe(2)
        expect(summary.modules.sd).toBe(2)
    })

    it('clears the module badge when the module is opened but keeps page badges', async () => {
        const { service } = setup({
            readable: ['sd.sales-orders'],
            records: { sdSalesOrder: [at(5), at(20)] },
            seen: { [BASELINE_SEEN_KEY]: T0, [moduleSeenKey('sd')]: at(30) },
        })

        const summary = await service.summary('user-1')

        expect(summary.modules.sd).toBe(0)
        expect(summary.pages['/modules/sd/sales-orders']).toBe(2)
    })

    it('sums hub features since the hub was opened, while features keep their own badges', async () => {
        const { service } = setup({
            readable: ['mm.procurement.rfqs', 'mm.procurement.purchase-orders'],
            records: { mmRfq: [at(5), at(25)], mmPurchaseOrder: [at(6), at(26)] },
            seen: {
                [BASELINE_SEEN_KEY]: T0,
                '/modules/mm/procurement': at(10),
                '/modules/mm/procurement/purchase-orders': at(30),
            },
        })

        const summary = await service.summary('user-1')

        expect(summary.pages['/modules/mm/procurement/rfqs']).toBe(2)
        expect(summary.pages['/modules/mm/procurement/purchase-orders']).toBe(0)
        expect(summary.pages['/modules/mm/procurement']).toBe(1)
        expect(summary.modules.mm).toBe(1)
    })

    it('only reports pages the user can read', async () => {
        const { service, prisma } = setup({
            readable: ['crm.leads'],
            records: { crmLead: [at(5)], sdSalesOrder: [at(5)] },
            seen: { [BASELINE_SEEN_KEY]: T0 },
        })

        const summary = await service.summary('user-1')

        expect(summary.modules).toEqual({ crm: 1 })
        expect(summary.pages).toEqual({ '/crm/leads': 1 })
        expect((prisma as unknown as Record<string, { count: jest.Mock }>).sdSalesOrder.count).not.toHaveBeenCalled()
    })

    it('stamps a baseline on first use so existing data is not reported as new', async () => {
        const { service, userModuleSeen } = setup({
            readable: ['sd.sales-orders'],
            records: { sdSalesOrder: [at(-60)] },
            seen: {},
        })

        const summary = await service.summary('user-1')

        expect(userModuleSeen.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ key: BASELINE_SEEN_KEY }),
            }),
        )
        expect(summary.modules.sd).toBe(0)
    })

    it('marks only known module and page keys as seen', async () => {
        const { service, userModuleSeen } = setup({ readable: [], records: {}, seen: {} })

        const result = await service.markSeen('user-1', [
            moduleSeenKey('sd'),
            '/modules/sd/sales-orders',
            '/modules/mm/procurement',
            '/not/a/page',
        ])

        expect(result).toEqual({ marked: 3 })
        const keys = userModuleSeen.upsert.mock.calls.map(([args]) => args.create.key)
        expect(keys).toEqual([
            moduleSeenKey('sd'),
            '/modules/sd/sales-orders',
            '/modules/mm/procurement',
        ])
    })
})
