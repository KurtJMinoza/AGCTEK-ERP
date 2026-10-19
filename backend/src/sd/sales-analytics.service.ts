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
const TOP_PRODUCT_LIMIT = 5

export type TrendBucket = 'day' | 'month'

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

type Totals = { revenue: Prisma.Decimal | null; orders: bigint }
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
}

@Injectable()
export class SalesAnalyticsService {
    constructor(private prisma: PrismaService) {}

    async sales(query: SalesAnalyticsQueryDto, now: Date = new Date()) {
        const range: SalesAnalyticsRange = query.range ?? 'month'
        const channel: SalesAnalyticsChannel = query.channel ?? 'ALL'
        const { from, bucket } = resolveRange(range, now)

        // Revenue-recognised orders: shipped / delivered / completed, or paid.
        // Orders without a stored header total fall back to their line totals.
        const scoped = Prisma.sql`
            WITH scoped AS (
                SELECT
                    o."id",
                    o."channel",
                    o."createdAt",
                    COALESCE(
                        o."totalAmount",
                        (
                            SELECT COALESCE(SUM(COALESCE(l."lineTotal", l."unitPrice" * l."quantity")), 0)
                            FROM "sd_sales_order_lines" l
                            WHERE l."salesOrderId" = o."id"
                        )
                    ) AS revenue
                FROM "sd_sales_orders" o
                WHERE o."createdAt" >= ${from}
                  AND o."createdAt" <= ${now}
                  AND o."status" NOT IN ('CANCELLED', 'DRAFT')
                  AND (
                      o."status" IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
                      OR o."paymentStatus" = 'Paid'
                  )
                  ${channel === 'ALL' ? Prisma.empty : Prisma.sql`AND o."channel" = ${channel}`}
            )`
        const unit = bucket === 'day' ? 'day' : 'month'
        const format = bucket === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'

        const [totals, channels, trend, products] = await Promise.all([
            this.prisma.$queryRaw<Totals[]>`
                ${scoped}
                SELECT SUM(revenue) AS revenue, COUNT(*) AS orders FROM scoped`,
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
                    COALESCE(l."productSkuSnapshot", l."sku") AS sku,
                    MAX(COALESCE(l."productNameSnapshot", l."description", l."sku")) AS product_name,
                    SUM(COALESCE(l."lineTotal", l."unitPrice" * l."quantity")) AS revenue,
                    SUM(l."quantity") AS units
                FROM scoped s
                JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                GROUP BY COALESCE(l."productSkuSnapshot", l."sku")
                ORDER BY revenue DESC NULLS LAST, units DESC NULLS LAST
                LIMIT ${TOP_PRODUCT_LIMIT}`,
        ])

        const totalRevenue = Number(totals[0]?.revenue ?? 0)
        const totalOrders = Number(totals[0]?.orders ?? 0)
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
            totalRevenue,
            totalOrders,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
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
            })),
        }
    }
}
