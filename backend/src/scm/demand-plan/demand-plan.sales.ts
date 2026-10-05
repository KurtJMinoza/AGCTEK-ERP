import { BadRequestException, Injectable } from '@nestjs/common'
import {
    DemandPlanBucket,
    DemandPlanGranularity,
    Prisma,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { optionalNumber, optionalString } from '../scm.utils'
import {
    TRUNC_UNIT,
    addPeriods,
    periodKey,
    periodLabel,
    periodStartOf,
} from './demand-plan.periods'

export type SalesAggRow = {
    product_key: string
    family: string | null
    location_code: string
    period_start: Date
    qty: number
    weeks: number
}

export type PastSalesQuery = {
    versionId?: string
    locationCode?: string
    /** Alias of locationCode. */
    locationId?: string
    bucket?: string
    granularity?: string
    historyLength?: string
    from?: string
    to?: string
}

const BUCKETS = Object.values(DemandPlanBucket)
const GRANULARITIES = Object.values(DemandPlanGranularity)

export const DEFAULT_HISTORY_LENGTH: Record<DemandPlanBucket, number> = {
    WEEK: 12,
    MONTH: 6,
    QUARTER: 4,
}
export const MAX_HISTORY_LENGTH: Record<DemandPlanBucket, number> = {
    WEEK: 104,
    MONTH: 36,
    QUARTER: 12,
}

/** `timestamp(3)` columns hold UTC; convert bound Dates explicitly (session TZ must not shift windows). */
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`

/**
 * Past sales actuals (weekly grain). Every conversion to a coarser bucket is a SQL
 * SUM over `date_trunc(bucket)` — the browser never pivots raw weekly history.
 */
@Injectable()
export class DemandSalesService {
    constructor(private readonly prisma: PrismaService) {}

    /** Plan-product scope + family mapping (family comes from the plan's lines). */
    private productJoin(versionId?: string) {
        return versionId
            ? Prisma.sql`JOIN (
                  SELECT "productCode", MIN("productFamily") AS "productFamily"
                  FROM "DemandForecast" WHERE "versionId" = ${versionId}
                  GROUP BY 1
              ) f ON f."productCode" = s."productCode"`
            : Prisma.sql`LEFT JOIN (
                  SELECT "productCode", MIN("productFamily") AS "productFamily"
                  FROM "DemandForecast" GROUP BY 1
              ) f ON f."productCode" = s."productCode"`
    }

    private keyCol(granularity: DemandPlanGranularity) {
        return granularity === 'SKU'
            ? Prisma.sql`s."productCode"`
            : Prisma.sql`COALESCE(f."productFamily", 'UNASSIGNED')`
    }

    /** Weekly actuals summed into `bucket` periods, grouped by product|family × location. */
    async aggregate(opts: {
        from: Date
        to: Date
        bucket: DemandPlanBucket
        granularity: DemandPlanGranularity
        locationCode?: string
        versionId?: string
    }): Promise<SalesAggRow[]> {
        const unit = Prisma.raw(`'${TRUNC_UNIT[opts.bucket]}'`)
        const locFilter = opts.locationCode
            ? Prisma.sql`AND s."locationCode" = ${opts.locationCode}`
            : Prisma.empty
        return this.prisma.$queryRaw<SalesAggRow[]>`
            SELECT ${this.keyCol(opts.granularity)} AS product_key,
                   MIN(f."productFamily") AS family,
                   s."locationCode" AS location_code,
                   date_trunc(${unit}, s."periodStart") AS period_start,
                   SUM(s."qty")::float8 AS qty,
                   COUNT(*)::int AS weeks
            FROM "DemandSalesActual" s
            ${this.productJoin(opts.versionId)}
            WHERE s."periodStart" >= ${utc(opts.from)}
              AND s."periodStart" < ${utc(opts.to)}
              ${locFilter}
            GROUP BY 1, 3, 4
            ORDER BY 1, 3, 4
        `
    }

    /** Total actuals per grid row over a window, with the number of weeks behind it. */
    async totalsByRow(opts: {
        versionId: string
        granularity: DemandPlanGranularity
        from: Date
        to: Date
        locationCode?: string
    }): Promise<Map<string, { qty: number; weeks: number }>> {
        const locFilter = opts.locationCode
            ? Prisma.sql`AND s."locationCode" = ${opts.locationCode}`
            : Prisma.empty
        const rows = await this.prisma.$queryRaw<
            Array<{ product_key: string; location_code: string; qty: number; weeks: number }>
        >`
            SELECT ${this.keyCol(opts.granularity)} AS product_key,
                   s."locationCode" AS location_code,
                   SUM(s."qty")::float8 AS qty,
                   COUNT(DISTINCT s."periodStart")::int AS weeks
            FROM "DemandSalesActual" s
            ${this.productJoin(opts.versionId)}
            WHERE s."periodStart" >= ${utc(opts.from)}
              AND s."periodStart" < ${utc(opts.to)}
              ${locFilter}
            GROUP BY 1, 2
        `
        return new Map(
            rows.map((r) => [
                `${r.product_key}|${r.location_code}`,
                { qty: r.qty, weeks: r.weeks },
            ]),
        )
    }

    /** Per-period totals (all rows) for the chart's history segment. */
    async periodTotals(opts: {
        versionId: string
        bucket: DemandPlanBucket
        from: Date
        to: Date
        locationCode?: string
    }) {
        const rows = await this.aggregate({ ...opts, granularity: 'FAMILY' })
        const totals = new Map<string, number>()
        for (const r of rows) {
            const k = periodKey(r.period_start)
            totals.set(k, (totals.get(k) ?? 0) + r.qty)
        }
        return totals
    }

    /** Warehouse master names (MM-03) for location codes; codes without a warehouse are omitted. */
    async locationNames(codes: string[]): Promise<Record<string, string>> {
        const unique = [...new Set(codes)]
        if (unique.length === 0) return {}
        const warehouses = await this.prisma.warehouse.findMany({
            where: { code: { in: unique } },
            select: { code: true, name: true },
        })
        return Object.fromEntries(warehouses.map((w) => [w.code, w.name]))
    }

    /** GET /scm/demand/past-sales — actuals pivoted to the requested bucket (server-side). */
    async pastSales(query: PastSalesQuery) {
        const bucket = parseBucket(query.bucket) ?? 'WEEK'
        const granularity = (() => {
            if (!query.granularity) return 'SKU' as const
            const g = query.granularity.toUpperCase() as DemandPlanGranularity
            if (!GRANULARITIES.includes(g)) {
                throw new BadRequestException(
                    `granularity must be one of ${GRANULARITIES.join(', ')}`,
                )
            }
            return g
        })()
        const locationCode =
            optionalString(query.locationCode) ?? optionalString(query.locationId)

        const to = query.to
            ? periodStartOf(parseDate(query.to, 'to'), bucket)
            : periodStartOf(new Date(), bucket)
        let from: Date
        if (query.from) {
            from = periodStartOf(parseDate(query.from, 'from'), bucket)
        } else {
            const n = optionalNumber(query.historyLength) ?? DEFAULT_HISTORY_LENGTH[bucket]
            if (!Number.isInteger(n) || n < 1 || n > MAX_HISTORY_LENGTH[bucket]) {
                throw new BadRequestException(
                    `historyLength must be 1–${MAX_HISTORY_LENGTH[bucket]} ${bucket.toLowerCase()}s`,
                )
            }
            from = addPeriods(to, bucket, -n)
        }
        if (from.getTime() >= to.getTime()) {
            throw new BadRequestException('from must be before to')
        }

        const periods: Array<{ key: string; label: string; start: string }> = []
        for (let d = from; d.getTime() < to.getTime(); d = addPeriods(d, bucket, 1)) {
            periods.push({
                key: periodKey(d),
                label: periodLabel(d, bucket),
                start: d.toISOString(),
            })
            if (periods.length > MAX_HISTORY_LENGTH[bucket]) {
                throw new BadRequestException('Requested range is too long')
            }
        }

        const agg = await this.aggregate({
            from,
            to,
            bucket,
            granularity,
            locationCode,
            versionId: optionalString(query.versionId),
        })

        const rowMap = new Map<
            string,
            {
                rowKey: string
                productKey: string
                family: string | null
                locationCode: string
                cells: Record<string, number>
                total: number
            }
        >()
        const totals: Record<string, number> = {}
        let grandTotal = 0
        for (const r of agg) {
            const rowKey = `${r.product_key}|${r.location_code}`
            let row = rowMap.get(rowKey)
            if (!row) {
                row = {
                    rowKey,
                    productKey: r.product_key,
                    family: granularity === 'SKU' ? r.family : null,
                    locationCode: r.location_code,
                    cells: {},
                    total: 0,
                }
                rowMap.set(rowKey, row)
            }
            const k = periodKey(r.period_start)
            row.cells[k] = r.qty
            row.total += r.qty
            totals[k] = (totals[k] ?? 0) + r.qty
            grandTotal += r.qty
        }

        const rows = [...rowMap.values()]
        return {
            bucket,
            granularity,
            locationCode: locationCode ?? null,
            from: from.toISOString(),
            to: to.toISOString(),
            periods,
            rows,
            totals,
            grandTotal,
            locationNames: await this.locationNames(rows.map((r) => r.locationCode)),
        }
    }
}

function parseBucket(v?: string): DemandPlanBucket | undefined {
    if (!v) return undefined
    const b = v.toUpperCase() as DemandPlanBucket
    if (!BUCKETS.includes(b)) {
        throw new BadRequestException(`bucket must be one of ${BUCKETS.join(', ')}`)
    }
    return b
}

function parseDate(v: string, field: string): Date {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`${field} must be an ISO date`)
    }
    return d
}
