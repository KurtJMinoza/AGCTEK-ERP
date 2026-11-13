import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
    SalesAnalyticsChannel,
    SalesAnalyticsQueryDto,
    SalesAnalyticsRange,
} from './dto/sales-analytics.dto'

/** Business calendar: the Philippines has no daylight saving, so a fixed offset is exact. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const TOP_PRODUCT_LIMIT = 10
const TOP_CUSTOMER_LIMIT = 10
const BUYERS_PER_PRODUCT = 8
const RECENT_ORDER_LIMIT = 10

const LINE_AMOUNT = Prisma.raw(
    'COALESCE(l."lineTotal", l."unitPrice" * l."quantity")',
)
const PRODUCT_KEY = Prisma.raw('COALESCE(l."productSkuSnapshot", l."sku")')
const PRODUCT_NAME = Prisma.raw(
    'COALESCE(l."productNameSnapshot", l."description", l."sku")',
)

export type TrendBucket = 'day' | 'month'

/** The comparison window: same length, immediately before the range. */
export function previousWindow(from: Date, now: Date) {
    return {
        from: new Date(from.getTime() - (now.getTime() - from.getTime())),
        to: from,
    }
}

/** Range start (inclusive, UTC instant) and trend granularity, in Manila calendar terms. */
export function resolveRange(
    range: SalesAnalyticsRange,
    now: Date = new Date(),
) {
    const local = new Date(now.getTime() + MANILA_OFFSET_MS)
    const y = local.getUTCFullYear()
    const m = local.getUTCMonth()
    const d = local.getUTCDate()
    const localMidnight = (year: number, month: number, day: number) =>
        new Date(Date.UTC(year, month, day) - MANILA_OFFSET_MS)

    switch (range) {
        case 'today':
            return {
                from: localMidnight(y, m, d),
                bucket: 'day' as TrendBucket,
            }
        case '7days':
            return {
                from: localMidnight(y, m, d - 6),
                bucket: 'day' as TrendBucket,
            }
        case 'month':
            return {
                from: localMidnight(y, m, 1),
                bucket: 'day' as TrendBucket,
            }
        case 'ytd':
            return {
                from: localMidnight(y, 0, 1),
                bucket: 'month' as TrendBucket,
            }
    }
}

/** Every bucket label (YYYY-MM-DD or YYYY-MM) from `from` to `now`, Manila calendar. */
export function bucketLabels(
    from: Date,
    now: Date,
    bucket: TrendBucket,
): string[] {
    const labels: string[] = []
    const start = new Date(from.getTime() + MANILA_OFFSET_MS)
    const end = new Date(now.getTime() + MANILA_OFFSET_MS)
    if (bucket === 'day') {
        for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
            labels.push(new Date(t).toISOString().slice(0, 10))
        }
        return labels
    }
    const cursor = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    )
    while (cursor <= end) {
        labels.push(cursor.toISOString().slice(0, 7))
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return labels
}

type Totals = {
    revenue: Prisma.Decimal | null
    orders: bigint
    customers: bigint
    units: Prisma.Decimal | null
}
type ChannelRow = {
    channel: string
    revenue: Prisma.Decimal | null
    orders: bigint
}
type TrendRow = {
    bucket: string
    revenue: Prisma.Decimal | null
    orders: bigint
}
type ProductRow = {
    sku: string | null
    product_name: string | null
    revenue: Prisma.Decimal | null
    units: Prisma.Decimal | null
    orders: bigint
    customers: bigint
}
type BuyerRow = {
    sku: string
    customer_key: string
    customer_name: string
    customer_number: string | null
    revenue: Prisma.Decimal | null
    units: Prisma.Decimal | null
    orders: bigint
}
type CustomerRow = {
    customer_key: string
    customer_id: string | null
    customer_name: string
    customer_number: string | null
    revenue: Prisma.Decimal | null
    orders: bigint
    units: Prisma.Decimal | null
    last_purchase_at: Date
}
type RecentOrderRow = {
    id: string
    order_number: string
    created_at: Date
    channel: string
    customer_name: string
    customer_number: string | null
    revenue: Prisma.Decimal | null
    units: Prisma.Decimal | null
    products: string[] | null
}

/**
 * Revenue-recognised orders of a window: shipped / delivered / completed, or
 * paid. Orders without a stored header total fall back to their line totals.
 * Sales without a Customer Master record group by the name typed at the sale.
 */
function scopedOrders(
    from: Date,
    to: Date,
    toInclusive: boolean,
    channel: SalesAnalyticsChannel,
) {
    return Prisma.sql`
        WITH scoped AS (
            SELECT
                o."id",
                o."orderNumber" AS order_number,
                o."channel",
                o."createdAt",
                c."id" AS customer_id,
                c."customerNumber" AS customer_number,
                COALESCE(c."id", NULLIF(TRIM(o."customerName"), ''), o."customerId") AS customer_key,
                COALESCE(c."companyName", NULLIF(TRIM(o."customerName"), ''), 'Walk-in') AS customer_name,
                COALESCE(
                    o."totalAmount",
                    (
                        SELECT COALESCE(SUM(${LINE_AMOUNT}), 0)
                        FROM "sd_sales_order_lines" l
                        WHERE l."salesOrderId" = o."id"
                    )
                ) AS revenue
            FROM "sd_sales_orders" o
            LEFT JOIN "sd_customers" c ON c."id" = o."customerId"
            WHERE o."createdAt" >= ${from}
              AND ${toInclusive ? Prisma.sql`o."createdAt" <= ${to}` : Prisma.sql`o."createdAt" < ${to}`}
              AND o."status" NOT IN ('CANCELLED', 'DRAFT')
              AND (
                  o."status" IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
                  OR o."paymentStatus" = 'Paid'
              )
              ${channel === 'ALL' ? Prisma.empty : Prisma.sql`AND o."channel" = ${channel}`}
        )`
}

const toTotals = (row: Totals | undefined) => {
    const totalRevenue = Number(row?.revenue ?? 0)
    const totalOrders = Number(row?.orders ?? 0)
    return {
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        totalUnits: Number(row?.units ?? 0),
        uniqueCustomers: Number(row?.customers ?? 0),
    }
}

@Injectable()
export class SalesAnalyticsService {
    constructor(private prisma: PrismaService) {}

    async sales(query: SalesAnalyticsQueryDto, now: Date = new Date()) {
        const range: SalesAnalyticsRange = query.range ?? 'month'
        const channel: SalesAnalyticsChannel = query.channel ?? 'ALL'
        const { from, bucket } = resolveRange(range, now)

        const previous = previousWindow(from, now)
        const scoped = scopedOrders(from, now, true, channel)
        const previousScoped = scopedOrders(
            previous.from,
            previous.to,
            false,
            channel,
        )
        const unit = bucket === 'day' ? 'day' : 'month'
        const format = bucket === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'
        const totalsSelect = Prisma.sql`
            SELECT
                SUM(revenue) AS revenue,
                COUNT(*) AS orders,
                COUNT(DISTINCT customer_key) AS customers,
                (
                    SELECT SUM(l."quantity")
                    FROM scoped s
                    JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                ) AS units
            FROM scoped`

        const [
            totals,
            previousTotals,
            channels,
            trend,
            products,
            customers,
            recentOrders,
        ] = await Promise.all([
            this.prisma.$queryRaw<Totals[]>`${scoped} ${totalsSelect}`,
            this.prisma.$queryRaw<Totals[]>`${previousScoped} ${totalsSelect}`,
            this.prisma.$queryRaw<ChannelRow[]>`
                ${scoped}
                SELECT "channel", SUM(revenue) AS revenue, COUNT(*) AS orders
                FROM scoped GROUP BY "channel" ORDER BY revenue DESC NULLS LAST`,
            this.prisma.$queryRaw<TrendRow[]>`
                ${scoped}
                SELECT
                    to_char(
                        date_trunc(${unit}, "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila'),
                        ${format}
                    ) AS bucket,
                    SUM(revenue) AS revenue,
                    COUNT(*) AS orders
                FROM scoped GROUP BY 1 ORDER BY 1`,
            this.prisma.$queryRaw<ProductRow[]>`
                ${scoped}
                SELECT
                    ${PRODUCT_KEY} AS sku,
                    MAX(${PRODUCT_NAME}) AS product_name,
                    SUM(${LINE_AMOUNT}) AS revenue,
                    SUM(l."quantity") AS units,
                    COUNT(DISTINCT s."id") AS orders,
                    COUNT(DISTINCT s.customer_key) AS customers
                FROM scoped s
                JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                GROUP BY ${PRODUCT_KEY}
                ORDER BY revenue DESC NULLS LAST, units DESC NULLS LAST
                LIMIT ${TOP_PRODUCT_LIMIT}`,
            this.prisma.$queryRaw<CustomerRow[]>`
                ${scoped}
                SELECT
                    s.customer_key,
                    MAX(s.customer_id) AS customer_id,
                    MAX(s.customer_name) AS customer_name,
                    MAX(s.customer_number) AS customer_number,
                    SUM(s.revenue) AS revenue,
                    COUNT(*) AS orders,
                    MAX(s."createdAt") AS last_purchase_at,
                    (
                        SELECT SUM(l."quantity")
                        FROM scoped s2
                        JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s2."id"
                        WHERE s2.customer_key = s.customer_key
                    ) AS units
                FROM scoped s
                GROUP BY s.customer_key
                ORDER BY revenue DESC NULLS LAST, orders DESC
                LIMIT ${TOP_CUSTOMER_LIMIT}`,
            this.prisma.$queryRaw<RecentOrderRow[]>`
                ${scoped}
                SELECT
                    s."id",
                    s.order_number,
                    s."createdAt" AS created_at,
                    s."channel",
                    s.customer_name,
                    s.customer_number,
                    s.revenue,
                    (
                        SELECT SUM(l."quantity")
                        FROM "sd_sales_order_lines" l
                        WHERE l."salesOrderId" = s."id"
                    ) AS units,
                    (
                        SELECT array_agg(DISTINCT ${PRODUCT_NAME})
                        FROM "sd_sales_order_lines" l
                        WHERE l."salesOrderId" = s."id"
                    ) AS products
                FROM scoped s
                ORDER BY s."createdAt" DESC
                LIMIT ${RECENT_ORDER_LIMIT}`,
        ])

        // Who bought each top product, largest buyers first.
        const productKeys = products
            .map((row) => row.sku)
            .filter((sku): sku is string => Boolean(sku))
        const buyers = productKeys.length
            ? await this.prisma.$queryRaw<BuyerRow[]>`
                ${scoped}
                SELECT * FROM (
                    SELECT
                        g.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY g.sku
                            ORDER BY g.revenue DESC NULLS LAST, g.units DESC NULLS LAST
                        ) AS rn
                    FROM (
                        SELECT
                            ${PRODUCT_KEY} AS sku,
                            s.customer_key,
                            MAX(s.customer_name) AS customer_name,
                            MAX(s.customer_number) AS customer_number,
                            SUM(${LINE_AMOUNT}) AS revenue,
                            SUM(l."quantity") AS units,
                            COUNT(DISTINCT s."id") AS orders
                        FROM scoped s
                        JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                        WHERE ${PRODUCT_KEY} IN (${Prisma.join(productKeys)})
                        GROUP BY ${PRODUCT_KEY}, s.customer_key
                    ) g
                ) ranked
                WHERE rn <= ${BUYERS_PER_PRODUCT}
                ORDER BY sku, rn`
            : []
        const buyersBySku = new Map<string, BuyerRow[]>()
        for (const row of buyers) {
            buyersBySku.set(row.sku, [...(buyersBySku.get(row.sku) ?? []), row])
        }

        const current = toTotals(totals[0])
        const byBucket = new Map(
            trend.map((row) => [
                row.bucket,
                {
                    revenue: Number(row.revenue ?? 0),
                    orders: Number(row.orders),
                },
            ]),
        )

        return {
            range,
            channel,
            from,
            to: now,
            currency: 'PHP',
            bucket,
            ...current,
            previous: {
                from: previous.from,
                to: previous.to,
                ...toTotals(previousTotals[0]),
            },
            channelSplit: channels.map((row) => ({
                channel: row.channel,
                revenue: Number(row.revenue ?? 0),
                orders: Number(row.orders),
            })),
            trend: bucketLabels(from, now, bucket).map((label) => ({
                bucket: label,
                revenue: byBucket.get(label)?.revenue ?? 0,
                orders: byBucket.get(label)?.orders ?? 0,
            })),
            topProducts: products.map((row) => ({
                sku: row.sku,
                productName: row.product_name ?? row.sku ?? 'Item',
                revenue: Number(row.revenue ?? 0),
                units: Number(row.units ?? 0),
                orders: Number(row.orders),
                customers: Number(row.customers),
                buyers: (row.sku ? (buyersBySku.get(row.sku) ?? []) : []).map(
                    (buyer) => ({
                        customerKey: buyer.customer_key,
                        customerName: buyer.customer_name,
                        customerNumber: buyer.customer_number,
                        revenue: Number(buyer.revenue ?? 0),
                        units: Number(buyer.units ?? 0),
                        orders: Number(buyer.orders),
                    }),
                ),
            })),
            topCustomers: customers.map((row) => ({
                customerKey: row.customer_key,
                customerId: row.customer_id,
                customerName: row.customer_name,
                customerNumber: row.customer_number,
                revenue: Number(row.revenue ?? 0),
                orders: Number(row.orders),
                units: Number(row.units ?? 0),
                lastPurchaseAt: row.last_purchase_at,
            })),
            recentOrders: recentOrders.map((row) => ({
                id: row.id,
                orderNumber: row.order_number,
                createdAt: row.created_at,
                channel: row.channel,
                customerName: row.customer_name,
                customerNumber: row.customer_number,
                revenue: Number(row.revenue ?? 0),
                units: Number(row.units ?? 0),
                products: row.products ?? [],
            })),
        }
    }
}
