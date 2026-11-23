import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { SalesAnalyticsChannel } from './dto/sales-analytics.dto'
import type {
    SalesPerformanceQueryDto,
    SalesTargetMonthDto,
} from './dto/sales-performance.dto'
import {
    EXT_LINE_UNIT_COST,
    EXT_SALE_AT,
    LINE_AMOUNT,
    LINE_UNIT_COST,
    MANILA_OFFSET_MS,
    roundMoney,
    scopedOrders,
} from './sales-analytics.service'

const pad2 = (value: number) => String(value).padStart(2, '0')

/** Payment tenders that count as money actually received. */
const COLLECTED_STATUSES = ['Paid', 'Authorized']

export type PerformanceWindows = {
    /** `YYYY-MM` actually used (defaults to the current Manila month). */
    month: string
    year: number
    /** 1..12 */
    monthNumber: number
    /** Jan 1 of the year through the end of the month (capped at `now`). */
    ytd: { from: Date; to: Date }
    /** The month itself (capped at `now`). */
    mth: { from: Date; to: Date }
}

/**
 * YTD and month windows for a Manila calendar month. Windows never extend past
 * `now`; a month that has not started yet yields an empty month window.
 */
export function resolvePerformanceWindows(
    month: string | undefined,
    now: Date = new Date(),
): PerformanceWindows {
    const local = new Date(now.getTime() + MANILA_OFFSET_MS)
    const key =
        month ?? `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}`
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key)
    if (!match) {
        throw new BadRequestException('`month` must look like YYYY-MM.')
    }
    const year = Number(match[1])
    const monthNumber = Number(match[2])

    const manila = (y: number, monthIndex: number) =>
        new Date(Date.UTC(y, monthIndex, 1) - MANILA_OFFSET_MS)
    const yearStart = manila(year, 0)
    const monthStart = manila(year, monthNumber - 1)
    const monthEnd = new Date(manila(year, monthNumber).getTime() - 1)
    const capped = monthEnd > now ? now : monthEnd

    return {
        month: key,
        year,
        monthNumber,
        ytd: { from: yearStart, to: capped > yearStart ? capped : yearStart },
        mth: { from: monthStart, to: capped > monthStart ? capped : monthStart },
    }
}

/** Percentage of `part` over `whole`, 2 decimals; null when there is no base. */
export function percentOf(part: number, whole: number): number | null {
    if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
        return null
    }
    return Math.round((part / whole) * 10_000) / 100
}

type MetricsRow = {
    sales: Prisma.Decimal | null
    qty: Prisma.Decimal | null
    line_sales: Prisma.Decimal | null
    costed_sales: Prisma.Decimal | null
    cost: Prisma.Decimal | null
}
/** BRANCH = physical store, ONLINE = e-commerce storefront or external platform, OTHER = unassigned direct sales. */
export type SalesLocationKind = 'BRANCH' | 'ONLINE' | 'OTHER'

type LocationRow = {
    kind: SalesLocationKind
    location: string
    sales: Prisma.Decimal | null
}
type AmountRow = { amount: Prisma.Decimal | null }

export type SalesPerformanceWindow = {
    from: Date
    to: Date
    sales: number
    qty: number
    /** (Sales − cost) / sales over lines with a known standard cost; null when none. */
    grossProfitRate: number | null
    /** Share of line sales whose material has a standard cost (0–100). */
    costCoverage: number | null
    salesTarget: number
    /** Sales as a % of the target; null when no target is set. */
    targetPercent: number | null
    collected: number
    collectionQuota: number
    /** Collected as a % of the quota; null when no quota is set. */
    quotaPercent: number | null
    byLocation: Array<{
        kind: SalesLocationKind
        location: string
        sales: number
        share: number
    }>
}

@Injectable()
export class SalesPerformanceService {
    constructor(private readonly prisma: PrismaService) {}

    async performance(query: SalesPerformanceQueryDto, now: Date = new Date()) {
        const channel: SalesAnalyticsChannel = query.channel ?? 'ALL'
        const windows = resolvePerformanceWindows(query.month, now)

        const [targets, ytd, mth] = await Promise.all([
            this.targetsForYear(windows.year),
            this.windowMetrics(windows.ytd.from, windows.ytd.to, channel),
            this.windowMetrics(windows.mth.from, windows.mth.to, channel),
        ])

        const upTo = targets.filter((t) => t.month <= windows.monthNumber)
        const current = targets.find((t) => t.month === windows.monthNumber)
        const sum = (rows: typeof targets, key: 'salesTarget' | 'collectionQuota') =>
            roundMoney(rows.reduce((total, row) => total + row[key], 0))

        const finish = (
            window: { from: Date; to: Date },
            metrics: Awaited<ReturnType<SalesPerformanceService['windowMetrics']>>,
            salesTarget: number,
            collectionQuota: number,
        ): SalesPerformanceWindow => ({
            from: window.from,
            to: window.to,
            sales: metrics.sales,
            qty: metrics.qty,
            grossProfitRate: metrics.grossProfitRate,
            costCoverage: metrics.costCoverage,
            salesTarget,
            targetPercent: percentOf(metrics.sales, salesTarget),
            collected: metrics.collected,
            collectionQuota,
            quotaPercent: percentOf(metrics.collected, collectionQuota),
            byLocation: metrics.byLocation,
        })

        return {
            month: windows.month,
            year: windows.year,
            monthNumber: windows.monthNumber,
            channel,
            currency: 'PHP',
            targetsConfigured: targets.some(
                (t) => t.salesTarget > 0 || t.collectionQuota > 0,
            ),
            ytd: finish(
                windows.ytd,
                ytd,
                sum(upTo, 'salesTarget'),
                sum(upTo, 'collectionQuota'),
            ),
            mth: finish(
                windows.mth,
                mth,
                current?.salesTarget ?? 0,
                current?.collectionQuota ?? 0,
            ),
        }
    }

    /** All 12 months of a year; months without a saved row are zero. */
    async targets(year: number = new Date().getUTCFullYear()) {
        const rows = await this.targetsForYear(year)
        return { year, months: rows }
    }

    async saveTargets(
        year: number,
        months: SalesTargetMonthDto[],
        userId?: string | null,
    ) {
        const seen = new Set<number>()
        for (const row of months) {
            if (seen.has(row.month)) {
                throw new BadRequestException(
                    `Month ${row.month} appears more than once.`,
                )
            }
            seen.add(row.month)
        }
        await this.prisma.$transaction(
            months.map((row) =>
                this.prisma.sdSalesTarget.upsert({
                    where: { year_month: { year, month: row.month } },
                    create: {
                        year,
                        month: row.month,
                        salesTarget: row.salesTarget,
                        collectionQuota: row.collectionQuota,
                        updatedBy: userId ?? null,
                    },
                    update: {
                        salesTarget: row.salesTarget,
                        collectionQuota: row.collectionQuota,
                        updatedBy: userId ?? null,
                    },
                }),
            ),
        )
        return this.targets(year)
    }

    private async targetsForYear(year: number) {
        const rows = await this.prisma.sdSalesTarget.findMany({
            where: { year },
            select: { month: true, salesTarget: true, collectionQuota: true },
        })
        const byMonth = new Map(rows.map((row) => [row.month, row]))
        return Array.from({ length: 12 }, (_, index) => {
            const row = byMonth.get(index + 1)
            return {
                month: index + 1,
                salesTarget: Number(row?.salesTarget ?? 0),
                collectionQuota: Number(row?.collectionQuota ?? 0),
            }
        })
    }

    /**
     * Sales, quantity, gross profit and collections of one window. Sales follow
     * the same revenue rules as the rest of Sales Analysis (`scopedOrders`).
     * Collections are verified, paid tenders received in the window (initial
     * tenders and later receivable collections); external platform sales are
     * settled, so they count as collected on their sale date.
     */
    private async windowMetrics(
        from: Date,
        to: Date,
        channel: SalesAnalyticsChannel,
    ) {
        const scoped = scopedOrders(from, to, true, channel)
        const includeOrders = channel !== 'EXTERNAL'
        const includeExternal = channel === 'ALL' || channel === 'EXTERNAL'
        const paidAt = Prisma.raw('COALESCE(p."paidAt", p."createdAt")')

        const [metrics, locations, tenders, external] = await Promise.all([
            this.prisma.$queryRaw<MetricsRow[]>`
                ${scoped}
                SELECT
                    (SELECT COALESCE(SUM(revenue), 0) FROM scoped) AS sales,
                    (SELECT COALESCE(SUM(quantity), 0) FROM slines) AS qty,
                    COALESCE(SUM(x.amount), 0) AS line_sales,
                    COALESCE(SUM(x.amount) FILTER (WHERE x.unit_cost > 0), 0) AS costed_sales,
                    COALESCE(SUM(x.unit_cost * x.quantity) FILTER (WHERE x.unit_cost > 0), 0) AS cost
                FROM (
                    SELECT
                        l."quantity" AS quantity,
                        ${LINE_AMOUNT} AS amount,
                        ${LINE_UNIT_COST} AS unit_cost
                    FROM scoped s
                    JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                    LEFT JOIN "mm_materials" m ON m."id" = l."materialId"
                    WHERE s.src = 'SO'
                    UNION ALL
                    SELECT
                        el."quantity",
                        el."grossAmount",
                        ${EXT_LINE_UNIT_COST}
                    FROM scoped s
                    JOIN "sd_ext_platform_transaction_lines" el ON el."transactionId" = s."id"
                    LEFT JOIN "mm_materials" m ON m."id" = el."materialId"
                    WHERE s.src = 'EXT'
                ) x`,
            // Where the sale happened: a physical branch (POS / branch-assigned
            // orders), the e-commerce storefront, or an external online platform
            // (Shopee, Lazada, … — named after the sales source).
            this.prisma.$queryRaw<LocationRow[]>`
                ${scoped}
                SELECT q.kind, q.location, SUM(q.revenue) AS sales
                FROM (
                    SELECT
                        CASE
                            WHEN UPPER(s."channel") = 'ECOMMERCE' THEN 'ONLINE'
                            WHEN NULLIF(TRIM(b."name"), '') IS NOT NULL
                                OR UPPER(s."channel") = 'POS' THEN 'BRANCH'
                            ELSE 'OTHER'
                        END AS kind,
                        CASE
                            WHEN UPPER(s."channel") = 'ECOMMERCE' THEN 'E-commerce'
                            WHEN NULLIF(TRIM(b."name"), '') IS NOT NULL THEN TRIM(b."name")
                            WHEN UPPER(s."channel") = 'POS' THEN 'Store (no branch)'
                            ELSE 'Direct sales'
                        END AS location,
                        s.revenue
                    FROM scoped s
                    JOIN "sd_sales_orders" o ON o."id" = s."id"
                    LEFT JOIN "branches" b ON b."id" = o."branchId"
                    WHERE s.src = 'SO'
                    UNION ALL
                    SELECT
                        'ONLINE',
                        COALESCE(NULLIF(TRIM(s."channel"), ''), 'External platform'),
                        s.revenue
                    FROM scoped s
                    WHERE s.src = 'EXT'
                ) q
                GROUP BY q.kind, q.location
                HAVING SUM(q.revenue) > 0
                ORDER BY sales DESC NULLS LAST, q.location`,
            includeOrders
                ? this.prisma.$queryRaw<AmountRow[]>`
                    SELECT COALESCE(SUM(p."amount"), 0) AS amount
                    FROM "sd_sales_order_payments" p
                    JOIN "sd_sales_orders" o ON o."id" = p."salesOrderId"
                    WHERE p."amount" > 0
                      AND p."status" IN (${Prisma.join(COLLECTED_STATUSES)})
                      AND p."verificationStatus" = 'VERIFIED'
                      AND o."status" NOT IN ('CANCELLED', 'DRAFT')
                      AND ${paidAt} >= ${from}
                      AND ${paidAt} <= ${to}
                      ${channel === 'ALL' ? Prisma.empty : Prisma.sql`AND o."channel" = ${channel}`}`
                : Promise.resolve<AmountRow[]>([]),
            includeExternal
                ? this.prisma.$queryRaw<AmountRow[]>`
                    SELECT COALESCE(SUM(t."grandTotal"), 0) AS amount
                    FROM "sd_ext_platform_transactions" t
                    WHERE t."status" IN ('CONFIRMED', 'APPROVED')
                      AND ${EXT_SALE_AT} >= ${from}
                      AND ${EXT_SALE_AT} <= ${to}`
                : Promise.resolve<AmountRow[]>([]),
        ])

        const row = metrics[0]
        const sales = roundMoney(Number(row?.sales ?? 0))
        const lineSales = Number(row?.line_sales ?? 0)
        const costedSales = Number(row?.costed_sales ?? 0)
        const cost = Number(row?.cost ?? 0)
        const total = locations.reduce(
            (sum, item) => sum + Number(item.sales ?? 0),
            0,
        )

        return {
            sales,
            qty: Number(row?.qty ?? 0),
            grossProfitRate:
                costedSales > 0
                    ? Math.round(((costedSales - cost) / costedSales) * 10_000) / 100
                    : null,
            costCoverage: percentOf(costedSales, lineSales),
            collected: roundMoney(
                Number(tenders[0]?.amount ?? 0) + Number(external[0]?.amount ?? 0),
            ),
            byLocation: locations.map((item) => ({
                kind: item.kind,
                location: item.location,
                sales: roundMoney(Number(item.sales ?? 0)),
                share: percentOf(Number(item.sales ?? 0), total) ?? 0,
            })),
        }
    }
}
