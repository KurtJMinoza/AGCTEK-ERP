import { BadRequestException, Injectable } from '@nestjs/common'
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
const LINE_REPORT_LIMIT = 2000

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

const localMidnightManila = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day) - MANILA_OFFSET_MS)

/** Parses `YYYY-MM-DD` as inclusive Manila start of day (UTC instant). */
export function parseManilaDateStart(ymd: string) {
    const [y, m, d] = ymd.split('-').map(Number)
    if (!y || !m || !d) {
        throw new BadRequestException('Invalid `from` date.')
    }
    return localMidnightManila(y, m - 1, d)
}

/** End of the Manila calendar day for `YYYY-MM-DD`, capped at `now`. */
export function parseManilaDateEnd(ymd: string, now: Date = new Date()) {
    const [y, m, d] = ymd.split('-').map(Number)
    if (!y || !m || !d) {
        throw new BadRequestException('Invalid `to` date.')
    }
    const end = new Date(
        localMidnightManila(y, m - 1, d).getTime() + DAY_MS - 1,
    )
    return end > now ? now : end
}

export function resolveCustomRange(
    fromYmd: string,
    toYmd: string,
    now: Date = new Date(),
) {
    const from = parseManilaDateStart(fromYmd)
    const to = parseManilaDateEnd(toYmd, now)
    if (from.getTime() > to.getTime()) {
        throw new BadRequestException(
            'The start date must be on or before the end date.',
        )
    }
    const spanDays = Math.ceil((to.getTime() - from.getTime()) / DAY_MS)
    const bucket: TrendBucket = spanDays > 62 ? 'month' : 'day'
    return { from, to, bucket, range: 'custom' as SalesAnalyticsRange }
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
    switch (range) {
        case 'today':
            return {
                from: localMidnightManila(y, m, d),
                bucket: 'day' as TrendBucket,
            }
        case '7days':
            return {
                from: localMidnightManila(y, m, d - 6),
                bucket: 'day' as TrendBucket,
            }
        case 'month':
            return {
                from: localMidnightManila(y, m, 1),
                bucket: 'day' as TrendBucket,
            }
        case 'ytd':
            return {
                from: localMidnightManila(y, 0, 1),
                bucket: 'month' as TrendBucket,
            }
        case 'custom':
            throw new BadRequestException(
                'Custom range requires `from` and `to` dates.',
            )
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
type LineReportRow = {
    product_image_url: string | null
    sales_channel: string
    customer_name: string
    location: string | null
    barcode: string | null
    account_title: string | null
    particular: string | null
    qty: Prisma.Decimal | null
    uom: string | null
    unit_cost: Prisma.Decimal | null
    total_cost: Prisma.Decimal | null
    srp: Prisma.Decimal | null
    sales: Prisma.Decimal | null
    discount: Prisma.Decimal | null
    subtotal: Prisma.Decimal | null
    total_sales: Prisma.Decimal | null
    sales_type: string
    invoice_type: string
    invoice_number: string | null
    order_number: string
    created_at: Date
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

/** External platform sale date as a UTC instant (Manila midnight), comparable with `createdAt`. */
const EXT_SALE_AT = Prisma.raw(`(t."transactionDate"::timestamp - interval '8 hours')`)

/**
 * Revenue-recognised sales of a window, one row per document (`src`):
 * - SO: sales orders shipped / delivered / completed, or paid. Orders without
 *   a stored header total fall back to their line totals.
 * - EXT: manually recorded external platform sales (Shopee, Lazada, …) once
 *   CONFIRMED or APPROVED, dated by their sale date; channel = platform name.
 * Sales without a Customer Master record group by the name typed at the sale.
 * `slines` is every line of those documents in one shape (product, qty, amount).
 */
function scopedOrders(
    from: Date,
    to: Date,
    toInclusive: boolean,
    channel: SalesAnalyticsChannel,
) {
    const before = (column: Prisma.Sql) =>
        toInclusive ? Prisma.sql`${column} <= ${to}` : Prisma.sql`${column} < ${to}`
    const includeOrders = channel !== 'EXTERNAL'
    const includeExternal = channel === 'ALL' || channel === 'EXTERNAL'
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
                ) AS revenue,
                'SO'::text AS src
            FROM "sd_sales_orders" o
            LEFT JOIN "sd_customers" c ON c."id" = o."customerId"
            WHERE ${includeOrders ? Prisma.sql`TRUE` : Prisma.sql`FALSE`}
              AND o."createdAt" >= ${from}
              AND ${before(Prisma.raw('o."createdAt"'))}
              AND o."status" NOT IN ('CANCELLED', 'DRAFT')
              AND (
                  o."status" IN ('SHIPPED', 'DELIVERED', 'COMPLETED')
                  OR o."paymentStatus" = 'Paid'
              )
              ${channel === 'ALL' || channel === 'EXTERNAL' ? Prisma.empty : Prisma.sql`AND o."channel" = ${channel}`}
            UNION ALL
            SELECT
                t."id",
                t."transactionNumber",
                ss."name",
                ${EXT_SALE_AT},
                c."id",
                c."customerNumber",
                COALESCE(c."id", NULLIF(TRIM(t."customerName"), ''), 'WALK-IN'),
                COALESCE(c."companyName", NULLIF(TRIM(t."customerName"), ''), 'Walk-in'),
                t."grandTotal",
                'EXT'::text
            FROM "sd_ext_platform_transactions" t
            JOIN "sd_sales_sources" ss ON ss."id" = t."salesSourceId"
            LEFT JOIN "sd_customers" c ON c."id" = t."customerId"
            WHERE ${includeExternal ? Prisma.sql`TRUE` : Prisma.sql`FALSE`}
              AND t."status" IN ('CONFIRMED', 'APPROVED')
              AND ${EXT_SALE_AT} >= ${from}
              AND ${before(EXT_SALE_AT)}
        ),
        slines AS (
            SELECT
                s."id" AS order_id,
                s.customer_key,
                s.customer_name,
                s.customer_number,
                ${PRODUCT_KEY} AS product_key,
                ${PRODUCT_NAME} AS product_name,
                l."quantity" AS quantity,
                ${LINE_AMOUNT} AS amount
            FROM scoped s
            JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
            WHERE s.src = 'SO'
            UNION ALL
            SELECT
                s."id",
                s.customer_key,
                s.customer_name,
                s.customer_number,
                COALESCE(el."sku", el."materialCode"),
                COALESCE(el."productName", el."materialName", el."description", el."sku"),
                el."quantity",
                el."grossAmount"
            FROM scoped s
            JOIN "sd_ext_platform_transaction_lines" el ON el."transactionId" = s."id"
            WHERE s.src = 'EXT'
        )`
}

const roundMoney = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

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
        const channel: SalesAnalyticsChannel = query.channel ?? 'ALL'
        const preset: SalesAnalyticsRange = query.range ?? 'month'

        let range: SalesAnalyticsRange
        let from: Date
        let to: Date
        let bucket: TrendBucket

        if (preset === 'custom' || (query.from && query.to)) {
            if (!query.from || !query.to) {
                throw new BadRequestException(
                    'Custom range requires `from` and `to` dates.',
                )
            }
            const custom = resolveCustomRange(query.from, query.to, now)
            range = custom.range
            from = custom.from
            to = custom.to
            bucket = custom.bucket
        } else {
            range = preset
            const resolved = resolveRange(preset, now)
            from = resolved.from
            to = now
            bucket = resolved.bucket
        }

        const previous = previousWindow(from, to)
        const scoped = scopedOrders(from, to, true, channel)
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
                (SELECT SUM(quantity) FROM slines) AS units
            FROM scoped`

        const [
            totals,
            previousTotals,
            channels,
            trend,
            products,
            customers,
            recentOrders,
            lineReport,
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
                    product_key AS sku,
                    MAX(product_name) AS product_name,
                    SUM(amount) AS revenue,
                    SUM(quantity) AS units,
                    COUNT(DISTINCT order_id) AS orders,
                    COUNT(DISTINCT customer_key) AS customers
                FROM slines
                GROUP BY product_key
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
                        SELECT SUM(sl.quantity)
                        FROM slines sl
                        WHERE sl.customer_key = s.customer_key
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
                        SELECT SUM(sl.quantity)
                        FROM slines sl
                        WHERE sl.order_id = s."id"
                    ) AS units,
                    (
                        SELECT array_agg(DISTINCT sl.product_name)
                        FROM slines sl
                        WHERE sl.order_id = s."id"
                    ) AS products
                FROM scoped s
                ORDER BY s."createdAt" DESC
                LIMIT ${RECENT_ORDER_LIMIT}`,
            this.prisma.$queryRaw<LineReportRow[]>`
                ${scoped}
                SELECT * FROM ((
                SELECT
                    COALESCE(
                        NULLIF(TRIM(l."productImageSnapshot"), ''),
                        NULLIF(TRIM(p."imageUrl"), ''),
                        ''
                    ) AS product_image_url,
                    s."channel" AS sales_channel,
                    s.customer_name,
                    COALESCE(
                        NULLIF(TRIM(b."name"), ''),
                        CASE UPPER(s."channel")
                            WHEN 'ECOMMERCE' THEN 'ONLINE'
                            WHEN 'POS' THEN 'STORE'
                            ELSE UPPER(s."channel")
                        END
                    ) AS location,
                    COALESCE(
                        NULLIF(TRIM(l."variantBarcode"), ''),
                        (
                            SELECT bc."barcodeValue"
                            FROM "mm_barcodes" bc
                            WHERE bc."materialId" = l."materialId"
                              AND bc."isPrimary" = true
                              AND bc."status" = 'ACTIVE'
                              AND bc."deletedAt" IS NULL
                            LIMIT 1
                        ),
                        'NA'
                    ) AS barcode,
                    COALESCE(
                        NULLIF(TRIM(p."category"), ''),
                        NULLIF(TRIM(mc."name"), ''),
                        ''
                    ) AS account_title,
                    COALESCE(
                        NULLIF(TRIM(l."productNameSnapshot"), ''),
                        NULLIF(TRIM(l."description"), ''),
                        NULLIF(TRIM(l."sku"), ''),
                        'Item'
                    ) AS particular,
                    l."quantity" AS qty,
                    COALESCE(su."code", bu."code", '') AS uom,
                    COALESCE(m."standardCost", 0) AS unit_cost,
                    (COALESCE(m."standardCost", 0) * l."quantity") AS total_cost,
                    COALESCE(l."unitPrice", 0) AS srp,
                    (COALESCE(l."unitPrice", 0) * l."quantity") AS sales,
                    (
                        COALESCE(o."discountAmount", 0)
                        * (COALESCE(l."unitPrice", 0) * l."quantity")
                        / NULLIF(
                            SUM(COALESCE(l."unitPrice", 0) * l."quantity")
                                OVER (PARTITION BY s."id"),
                            0
                        )
                    ) AS discount,
                    (
                        (COALESCE(l."unitPrice", 0) * l."quantity")
                        - (
                            COALESCE(o."discountAmount", 0)
                            * (COALESCE(l."unitPrice", 0) * l."quantity")
                            / NULLIF(
                                SUM(COALESCE(l."unitPrice", 0) * l."quantity")
                                    OVER (PARTITION BY s."id"),
                                0
                            )
                        )
                    ) AS subtotal,
                    (
                        (COALESCE(l."unitPrice", 0) * l."quantity")
                        - (
                            COALESCE(o."discountAmount", 0)
                            * (COALESCE(l."unitPrice", 0) * l."quantity")
                            / NULLIF(
                                SUM(COALESCE(l."unitPrice", 0) * l."quantity")
                                    OVER (PARTITION BY s."id"),
                                0
                            )
                        )
                    ) AS total_sales,
                    CASE
                        WHEN c."customerAccountType" = 'CREDIT'
                            OR UPPER(COALESCE(o."paymentMethod", '')) LIKE '%CREDIT%'
                            OR o."paymentMethod" = 'SALARY_LOAN'
                        THEN 'CREDIT'
                        ELSE 'CASH'
                    END AS sales_type,
                    CASE
                        WHEN inv."id" IS NOT NULL
                            AND c."customerAccountType" = 'CREDIT'
                        THEN 'CHARGE INVOICE'
                        WHEN inv."id" IS NOT NULL THEN 'INVOICE'
                        ELSE 'NONE'
                    END AS invoice_type,
                    COALESCE(
                        NULLIF(TRIM(inv."invoiceNumber"), ''),
                        NULLIF(TRIM(o."receiptNumber"), ''),
                        NULLIF(TRIM(s.order_number), '')
                    ) AS invoice_number,
                    s.order_number,
                    s."createdAt" AS created_at,
                    l."lineNumber" AS line_no
                FROM scoped s
                INNER JOIN "sd_sales_orders" o ON o."id" = s."id"
                INNER JOIN "sd_sales_order_lines" l ON l."salesOrderId" = s."id"
                LEFT JOIN "sd_customers" c ON c."id" = s.customer_id
                LEFT JOIN "branches" b ON b."id" = o."branchId"
                LEFT JOIN "sd_products" p ON p."id" = l."productId"
                LEFT JOIN "mm_materials" m ON m."id" = l."materialId"
                LEFT JOIN "mm_material_categories" mc ON mc."id" = m."materialCategoryId"
                LEFT JOIN "mm_uoms" su ON su."id" = l."salesUomId"
                LEFT JOIN "mm_uoms" bu ON bu."id" = m."baseUomId"
                LEFT JOIN "sd_sales_invoices" inv ON inv."salesOrderId" = s."id"
                WHERE s.src = 'SO'
                ) UNION ALL (
                SELECT
                    COALESCE(NULLIF(TRIM(p."imageUrl"), ''), '') AS product_image_url,
                    s."channel" AS sales_channel,
                    s.customer_name,
                    COALESCE(NULLIF(TRIM(b."name"), ''), UPPER(s."channel")) AS location,
                    COALESCE(
                        (
                            SELECT bc."barcodeValue"
                            FROM "mm_barcodes" bc
                            WHERE bc."materialId" = el."materialId"
                              AND bc."isPrimary" = true
                              AND bc."status" = 'ACTIVE'
                              AND bc."deletedAt" IS NULL
                            LIMIT 1
                        ),
                        'NA'
                    ) AS barcode,
                    COALESCE(
                        NULLIF(TRIM(p."category"), ''),
                        NULLIF(TRIM(mc."name"), ''),
                        ''
                    ) AS account_title,
                    COALESCE(
                        NULLIF(TRIM(el."productName"), '')
                            || COALESCE(' — ' || NULLIF(TRIM(el."variantName"), ''), ''),
                        NULLIF(TRIM(el."description"), ''),
                        NULLIF(TRIM(el."materialName"), ''),
                        'Item'
                    ) AS particular,
                    el."quantity" AS qty,
                    COALESCE(u."code", bu."code", '') AS uom,
                    COALESCE(m."standardCost", 0) AS unit_cost,
                    (COALESCE(m."standardCost", 0) * el."quantity") AS total_cost,
                    el."unitPrice" AS srp,
                    (el."unitPrice" * el."quantity") AS sales,
                    el."discount" AS discount,
                    el."lineSubtotal" AS subtotal,
                    el."grossAmount" AS total_sales,
                    CASE WHEN c."customerAccountType" = 'CREDIT' THEN 'CREDIT' ELSE 'CASH' END AS sales_type,
                    'NONE' AS invoice_type,
                    COALESCE(NULLIF(TRIM(t."externalOrderRef"), ''), s.order_number) AS invoice_number,
                    s.order_number,
                    s."createdAt" AS created_at,
                    el."lineNumber" AS line_no
                FROM scoped s
                INNER JOIN "sd_ext_platform_transactions" t ON t."id" = s."id"
                INNER JOIN "sd_ext_platform_transaction_lines" el ON el."transactionId" = s."id"
                LEFT JOIN "sd_customers" c ON c."id" = t."customerId"
                LEFT JOIN "branches" b ON b."id" = t."branchId"
                LEFT JOIN "sd_products" p ON p."id" = el."productId"
                LEFT JOIN "mm_materials" m ON m."id" = el."materialId"
                LEFT JOIN "mm_material_categories" mc ON mc."id" = m."materialCategoryId"
                LEFT JOIN "mm_uoms" u ON u."id" = el."uomId"
                LEFT JOIN "mm_uoms" bu ON bu."id" = m."baseUomId"
                WHERE s.src = 'EXT'
                )) report
                ORDER BY created_at DESC, order_number, line_no
                LIMIT ${LINE_REPORT_LIMIT}`,
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
                            product_key AS sku,
                            customer_key,
                            MAX(customer_name) AS customer_name,
                            MAX(customer_number) AS customer_number,
                            SUM(amount) AS revenue,
                            SUM(quantity) AS units,
                            COUNT(DISTINCT order_id) AS orders
                        FROM slines
                        WHERE product_key IN (${Prisma.join(productKeys)})
                        GROUP BY product_key, customer_key
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
            to,
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
            trend: bucketLabels(from, to, bucket).map((label) => ({
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
            lineReport: lineReport.map((row) => ({
                productImageUrl: row.product_image_url?.trim() || null,
                salesChannel: row.sales_channel,
                customerName: row.customer_name,
                location: row.location ?? '',
                barcode: row.barcode ?? 'NA',
                accountTitle: row.account_title ?? '',
                particular: row.particular ?? '',
                quantity: Number(row.qty ?? 0),
                uom: row.uom ?? '',
                unitCost: roundMoney(Number(row.unit_cost ?? 0)),
                totalCost: roundMoney(Number(row.total_cost ?? 0)),
                srp: roundMoney(Number(row.srp ?? 0)),
                sales: roundMoney(Number(row.sales ?? 0)),
                discount: roundMoney(Number(row.discount ?? 0)),
                subtotal: roundMoney(Number(row.subtotal ?? 0)),
                totalSales: roundMoney(Number(row.total_sales ?? 0)),
                salesType: row.sales_type,
                invoiceType: row.invoice_type,
                invoiceNumber: row.invoice_number ?? '',
                orderNumber: row.order_number,
                createdAt: row.created_at,
            })),
        }
    }
}
