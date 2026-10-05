import {
    BadRequestException,
    ConflictException,
    Injectable,
} from '@nestjs/common'
import {
    DemandHorizonKind,
    DemandPlanBucket,
    DemandPlanGranularity,
    DemandPlanStatus,
    Prisma,
    type DemandPlanVersion,
} from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
    assertFound,
    optionalNumber,
    optionalString,
    parsePagination,
    requireString,
} from '../scm.utils'
import {
    HORIZON_PRESETS,
    MAX_VIEW_LENGTH,
    TRUNC_UNIT,
    addPeriods,
    buildPeriods,
    freezeUntilFor,
    periodKey,
    periodLabel,
    periodStartOf,
} from './demand-plan.periods'
import { buildChart, type ChartDensityRequest } from './demand-plan.chart'
import {
    GENERATION_METHODS,
    MOVING_AVERAGE_WINDOWS,
    movingAverage,
    splitAcrossWeeks,
} from './demand-plan.generate'
import { DemandSalesService, MAX_HISTORY_LENGTH } from './demand-plan.sales'

const CHART_DENSITIES: readonly ChartDensityRequest[] = ['AUTO', 'FAMILY']

type PlanListQuery = {
    page?: string
    pageSize?: string
    status?: string
    horizonKind?: string
}

export type GridQuery = {
    horizonKind?: string
    bucket?: string
    viewLength?: string
    granularity?: string
    locationCode?: string
    compareVersionId?: string
    chartDensity?: string
}

type CellAdjustment = {
    lineId?: unknown
    adjustedQty?: unknown
    reason?: unknown
}

type AggRow = {
    product_key: string
    family: string | null
    location_code: string
    period_start: Date
    system_qty: number
    effective_qty: number
    line_count: number
    adjusted_count: number
    line_id: string
}

const STATUS_TRANSITIONS: Record<DemandPlanStatus, DemandPlanStatus[]> = {
    DRAFT: ['REVIEWED'],
    REVIEWED: ['DRAFT', 'APPROVED'],
    APPROVED: ['REVIEWED'],
    PUBLISHED: [],
}

const MAX_CELLS_PER_PATCH = 500

function parseEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    field: string,
): T | undefined {
    if (value == null || value === '') return undefined
    const v = String(value).toUpperCase() as T
    if (!allowed.includes(v)) {
        throw new BadRequestException(
            `${field} must be one of ${allowed.join(', ')}`,
        )
    }
    return v
}

const HORIZON_KINDS = Object.values(DemandHorizonKind)
const BUCKETS = Object.values(DemandPlanBucket)
const GRANULARITIES = Object.values(DemandPlanGranularity)
const STATUSES = Object.values(DemandPlanStatus)

@Injectable()
export class DemandPlanService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly sales: DemandSalesService,
    ) {}

    presets() {
        return Object.values(HORIZON_PRESETS)
    }

    async list(query: PlanListQuery) {
        const { page, pageSize, skip } = parsePagination(query)
        const where: Prisma.DemandPlanVersionWhereInput = {}
        const status = parseEnum(query.status, STATUSES, 'status')
        const horizonKind = parseEnum(
            query.horizonKind,
            HORIZON_KINDS,
            'horizonKind',
        )
        if (status) where.status = status
        if (horizonKind) where.horizonKind = horizonKind

        const [data, total] = await this.prisma.$transaction([
            this.prisma.demandPlanVersion.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }],
                skip,
                take: pageSize,
                include: { _count: { select: { lines: true } } },
            }),
            this.prisma.demandPlanVersion.count({ where }),
        ])
        return { data, total, page, pageSize }
    }

    async findOne(id: string) {
        const version = assertFound(
            await this.prisma.demandPlanVersion.findUnique({
                where: { id },
                include: {
                    _count: { select: { lines: true, adjustments: true } },
                    adjustments: {
                        orderBy: { createdAt: 'desc' },
                        take: 50,
                        include: {
                            forecast: {
                                select: {
                                    productCode: true,
                                    locationCode: true,
                                    periodStart: true,
                                },
                            },
                        },
                    },
                },
            }),
            'Demand plan not found',
        )
        const overrideCount = await this.prisma.demandForecast.count({
            where: {
                versionId: id,
                OR: [{ adjustedQty: { not: null } }, { consensusQty: { not: null } }],
            },
        })
        return {
            ...version,
            overrideCount,
            freezeUntil: freezeUntilFor(
                version.bucket,
                version.freezeFencePeriods,
            ).toISOString(),
            readOnly: this.readOnlyReason(version) !== null,
            readOnlyReason: this.readOnlyReason(version),
        }
    }

    async create(body: Record<string, unknown>, actor?: string) {
        const horizonKind =
            parseEnum(body.horizonKind, HORIZON_KINDS, 'horizonKind') ??
            'OPERATIONAL'
        const preset = HORIZON_PRESETS[horizonKind]
        const code = optionalString(body.code) ?? (await this.nextCode())

        const sourceId =
            optionalString(body.copyFromVersionId) ??
            (
                await this.prisma.demandPlanVersion.findFirst({
                    where: { status: 'PUBLISHED' },
                    orderBy: { publishedAt: 'desc' },
                    select: { id: true },
                })
            )?.id

        return this.prisma.$transaction(async (tx) => {
            const exists = await tx.demandPlanVersion.findUnique({
                where: { code },
            })
            if (exists) {
                throw new ConflictException(`Plan code ${code} already exists`)
            }
            const version = await tx.demandPlanVersion.create({
                data: {
                    code,
                    horizonKind,
                    bucket: preset.bucket,
                    viewLength: preset.viewLength,
                    granularity: preset.granularity,
                    freezeFencePeriods: preset.freezeFencePeriods,
                    notes: optionalString(body.notes) ?? null,
                    createdBy: actor ?? null,
                },
            })

            if (sourceId) {
                const source = await tx.demandForecast.findMany({
                    where: { versionId: sourceId },
                })
                const rows = source.map((l) => ({
                    versionId: version.id,
                    productCode: l.productCode,
                    productFamily: l.productFamily,
                    locationCode: l.locationCode,
                    periodStart: l.periodStart,
                    periodEnd: l.periodEnd,
                    quantity: l.consensusQty ?? l.adjustedQty ?? l.quantity,
                    historicalQty: l.historicalQty,
                    unit: l.unit,
                    source: 'STAT',
                }))
                for (let i = 0; i < rows.length; i += 1000) {
                    await tx.demandForecast.createMany({
                        data: rows.slice(i, i + 1000),
                    })
                }
            }
            return version
        })
    }

    async update(id: string, body: Record<string, unknown>) {
        const version = assertFound(
            await this.prisma.demandPlanVersion.findUnique({ where: { id } }),
            'Demand plan not found',
        )
        if (version.status === 'PUBLISHED') {
            throw new ConflictException('Published plans are immutable')
        }

        const data: Prisma.DemandPlanVersionUpdateInput = {}
        const nextStatus = parseEnum(body.status, STATUSES, 'status')
        if (nextStatus && nextStatus !== version.status) {
            if (nextStatus === 'PUBLISHED') {
                throw new BadRequestException(
                    'Use POST /scm/demand/plans/:id/publish to publish',
                )
            }
            if (!STATUS_TRANSITIONS[version.status].includes(nextStatus)) {
                throw new ConflictException(
                    `Cannot move plan from ${version.status} to ${nextStatus}`,
                )
            }
            data.status = nextStatus
            data.approvedAt = nextStatus === 'APPROVED' ? new Date() : null
        }

        const viewLength = optionalNumber(body.viewLength)
        const freeze = optionalNumber(body.freezeFencePeriods)
        if (viewLength !== undefined || freeze !== undefined) {
            if (version.status !== 'DRAFT') {
                throw new ConflictException(
                    'Horizon settings can only change while the plan is DRAFT',
                )
            }
            if (viewLength !== undefined) {
                if (
                    !Number.isInteger(viewLength) ||
                    viewLength < 1 ||
                    viewLength > MAX_VIEW_LENGTH[version.bucket]
                ) {
                    throw new BadRequestException(
                        `viewLength must be 1–${MAX_VIEW_LENGTH[version.bucket]} ${version.bucket.toLowerCase()}s`,
                    )
                }
                data.viewLength = viewLength
            }
            if (freeze !== undefined) {
                if (!Number.isInteger(freeze) || freeze < 0 || freeze > 52) {
                    throw new BadRequestException(
                        'freezeFencePeriods must be an integer 0–52',
                    )
                }
                data.freezeFencePeriods = freeze
            }
        }
        if (body.notes !== undefined) {
            data.notes = optionalString(body.notes) ?? null
        }

        const res = await this.prisma.demandPlanVersion.updateMany({
            where: { id, status: version.status },
            data: data as Prisma.DemandPlanVersionUpdateManyMutationInput,
        })
        if (res.count === 0) {
            throw new ConflictException(
                'Plan status changed concurrently; reload and retry',
            )
        }
        return this.findOne(id)
    }

    async publish(id: string) {
        assertFound(
            await this.prisma.demandPlanVersion.findUnique({ where: { id } }),
            'Demand plan not found',
        )
        const res = await this.prisma.demandPlanVersion.updateMany({
            where: { id, status: 'APPROVED' },
            data: { status: 'PUBLISHED', publishedAt: new Date() },
        })
        if (res.count === 0) {
            throw new ConflictException('Only APPROVED plans can be published')
        }
        return this.findOne(id)
    }

    /**
     * Server-side rollup of base-grain lines (SKU × location × week) to the requested
     * horizon grain. The browser never receives the base dataset for pivoting.
     */
    /** Horizon scope shared by grid, chart and generation (same version + location + horizon). */
    private resolveScope(version: DemandPlanVersion, query: GridQuery) {
        const requestedKind =
            parseEnum(query.horizonKind, HORIZON_KINDS, 'horizonKind') ??
            version.horizonKind
        const base =
            requestedKind === version.horizonKind
                ? {
                      bucket: version.bucket,
                      viewLength: version.viewLength,
                      granularity: version.granularity,
                  }
                : HORIZON_PRESETS[requestedKind]
        const bucket =
            parseEnum(query.bucket, BUCKETS, 'bucket') ?? base.bucket
        const granularity =
            parseEnum(query.granularity, GRANULARITIES, 'granularity') ??
            base.granularity
        const viewLength = Math.min(
            Math.max(1, Math.trunc(optionalNumber(query.viewLength) ?? base.viewLength)),
            MAX_VIEW_LENGTH[bucket],
        )
        const locationCode = optionalString(query.locationCode)
        const rangeStart = periodStartOf(new Date(), bucket)
        const rangeEnd = addPeriods(rangeStart, bucket, viewLength)
        const historyStart = addPeriods(rangeStart, bucket, -viewLength)
        const freezeUntil = freezeUntilFor(
            version.bucket,
            version.freezeFencePeriods,
        )
        const periods = buildPeriods(rangeStart, bucket, viewLength, freezeUntil)
        return {
            requestedKind,
            bucket,
            granularity,
            viewLength,
            locationCode,
            rangeStart,
            rangeEnd,
            historyStart,
            freezeUntil,
            periods,
        }
    }

    async grid(id: string, query: GridQuery) {
        const version = assertFound(
            await this.prisma.demandPlanVersion.findUnique({ where: { id } }),
            'Demand plan not found',
        )
        const {
            requestedKind,
            bucket,
            granularity,
            viewLength,
            locationCode,
            rangeStart,
            rangeEnd,
            historyStart,
            freezeUntil,
            periods,
        } = this.resolveScope(version, query)
        const chartDensity =
            parseEnum(query.chartDensity, CHART_DENSITIES, 'chartDensity') ?? 'AUTO'
        const chartHistoryLength = Math.min(viewLength, 12)
        const chartHistoryStart = addPeriods(rangeStart, bucket, -chartHistoryLength)

        const [agg, history, compare, locations, historyTotals] = await Promise.all([
            this.aggregate(id, bucket, granularity, rangeStart, rangeEnd, locationCode),
            this.sales.totalsByRow({
                versionId: id,
                granularity,
                from: historyStart,
                to: rangeStart,
                locationCode,
            }),
            query.compareVersionId
                ? this.aggregate(
                      query.compareVersionId,
                      bucket,
                      granularity,
                      rangeStart,
                      rangeEnd,
                      locationCode,
                  )
                : Promise.resolve([] as AggRow[]),
            this.prisma.demandForecast.findMany({
                where: { versionId: id },
                distinct: ['locationCode'],
                select: { locationCode: true },
                orderBy: { locationCode: 'asc' },
            }),
            this.sales.periodTotals({
                versionId: id,
                bucket,
                from: chartHistoryStart,
                to: rangeStart,
                locationCode,
            }),
        ])
        const historyPeriods = Array.from({ length: chartHistoryLength }, (_, i) => {
            const start = addPeriods(chartHistoryStart, bucket, i)
            const key = periodKey(start)
            return {
                key,
                label: periodLabel(start, bucket),
                qty: historyTotals.get(key) ?? null,
            }
        })

        const baseGrain = bucket === 'WEEK' && granularity === 'SKU'
        const readOnlyReason =
            this.readOnlyReason(version) ??
            (HORIZON_PRESETS[requestedKind].readOnly
                ? 'Strategic horizon is aggregate and read-only.'
                : !baseGrain
                  ? 'Rolled-up view. Adjust at Operational (SKU × week) grain.'
                  : null)

        const compareMap = new Map<string, number>()
        for (const c of compare) {
            compareMap.set(
                `${c.product_key}|${c.location_code}|${periodKey(c.period_start)}`,
                c.effective_qty,
            )
        }

        type Cell = {
            qty: number
            systemQty: number
            adjusted: boolean
            lineId: string | null
            compareQty?: number | null
        }
        const rowMap = new Map<
            string,
            {
                rowKey: string
                productKey: string
                family: string | null
                locationCode: string
                cells: Record<string, Cell>
                total: number
                systemTotal: number
                historyQty: number | null
                historyWeeks: number
            }
        >()

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
                    systemTotal: 0,
                    historyQty: history.get(rowKey)?.qty ?? null,
                    historyWeeks: history.get(rowKey)?.weeks ?? 0,
                }
                rowMap.set(rowKey, row)
            }
            const pk = periodKey(r.period_start)
            row.cells[pk] = {
                qty: r.effective_qty,
                systemQty: r.system_qty,
                adjusted: r.adjusted_count > 0,
                lineId: baseGrain && r.line_count === 1 ? r.line_id : null,
                ...(query.compareVersionId
                    ? { compareQty: compareMap.get(`${rowKey}|${pk}`) ?? null }
                    : {}),
            }
            row.total += r.effective_qty
            row.systemTotal += r.system_qty
        }

        const locationCodes = locations.map((l) => l.locationCode)
        const locationNames = await this.sales.locationNames(locationCodes)

        const rows = [...rowMap.values()]
        const totals: Record<string, number> = {}
        let grandTotal = 0
        for (const row of rows) {
            for (const [pk, cell] of Object.entries(row.cells)) {
                totals[pk] = (totals[pk] ?? 0) + cell.qty
            }
            grandTotal += row.total
        }

        return {
            version: {
                id: version.id,
                code: version.code,
                status: version.status,
                horizonKind: version.horizonKind,
            },
            scope: {
                horizonKind: requestedKind,
                bucket,
                viewLength,
                granularity,
                locationCode: locationCode ?? null,
                rangeStart: rangeStart.toISOString(),
                rangeEnd: rangeEnd.toISOString(),
                freezeUntil: freezeUntil.toISOString(),
                editable: readOnlyReason === null,
                readOnlyReason,
                compareVersionId: query.compareVersionId ?? null,
            },
            periods,
            rows,
            totals,
            grandTotal,
            locations: locationCodes,
            locationNames,
            chart: buildChart({
                periods,
                rows,
                hasCompare: Boolean(query.compareVersionId),
                density: chartDensity,
                windowWeeks: Math.round(
                    (rangeEnd.getTime() - rangeStart.getTime()) / (7 * 86_400_000),
                ),
                horizonKind: requestedKind,
                bucket,
                granularity,
                history: historyPeriods,
            }),
        }
    }

    /**
     * DRAFT only. Past sales → SUM into the plan bucket (SQL) → moving average →
     * write `quantity` (system forecast) on non-frozen weekly lines. Overrides
     * (`adjustedQty` / `consensusQty`) are kept unless `overwriteAdjustments: true`.
     * Returns the refreshed plan + grid/chart payload for the same scope.
     */
    async generateForecast(
        id: string,
        body: Record<string, unknown>,
        actor?: string,
    ) {
        const version = assertFound(
            await this.prisma.demandPlanVersion.findUnique({ where: { id } }),
            'Demand plan not found',
        )
        if (version.status !== 'DRAFT') {
            throw new ConflictException(
                `Forecast generation is only allowed while the plan is DRAFT (plan is ${version.status})`,
            )
        }
        const method = parseEnum(
            body.method ?? 'MOVING_AVERAGE',
            GENERATION_METHODS,
            'method',
        )!
        const window = Number(body.window ?? 4)
        if (!(MOVING_AVERAGE_WINDOWS as readonly number[]).includes(window)) {
            throw new BadRequestException(
                `window must be one of ${MOVING_AVERAGE_WINDOWS.join(', ')}`,
            )
        }
        const overwriteAdjustments = body.overwriteAdjustments === true

        const scopeQuery: GridQuery = {
            horizonKind: optionalString(body.horizonKind),
            locationCode: optionalString(body.locationCode),
            compareVersionId: optionalString(body.compareVersionId),
            chartDensity: optionalString(body.chartDensity),
        }
        const scope = this.resolveScope(version, scopeQuery)
        const { bucket, periods, rangeStart, rangeEnd, freezeUntil, locationCode } =
            scope
        if (bucket === 'QUARTER') {
            throw new BadRequestException(
                'Generate at the Operational (weekly) or Tactical (monthly) horizon',
            )
        }
        const historyLength =
            body.historyLength == null ? window : Number(body.historyLength)
        if (
            !Number.isInteger(historyLength) ||
            historyLength < window ||
            historyLength > MAX_HISTORY_LENGTH[bucket]
        ) {
            throw new BadRequestException(
                `historyLength must be ${window}–${MAX_HISTORY_LENGTH[bucket]} ${bucket.toLowerCase()}s`,
            )
        }
        const historyFrom = addPeriods(rangeStart, bucket, -historyLength)
        const historyKeys = Array.from({ length: historyLength }, (_, i) =>
            periodKey(addPeriods(historyFrom, bucket, i)),
        )

        const [pairs, history] = await Promise.all([
            this.prisma.demandForecast.findMany({
                where: { versionId: id, ...(locationCode ? { locationCode } : {}) },
                distinct: ['productCode', 'locationCode'],
                select: {
                    productCode: true,
                    locationCode: true,
                    productFamily: true,
                    unit: true,
                },
            }),
            // Bucket conversion happens here: weekly actuals SUMmed per plan bucket.
            this.sales.aggregate({
                from: historyFrom,
                to: rangeStart,
                bucket,
                granularity: 'SKU',
                locationCode,
                versionId: id,
            }),
        ])
        const histByPair = new Map<string, Map<string, number>>()
        for (const h of history) {
            const k = `${h.product_key}|${h.location_code}`
            if (!histByPair.has(k)) histByPair.set(k, new Map())
            histByPair.get(k)!.set(periodKey(h.period_start), h.qty)
        }

        const targets = periods.filter((p) => !p.frozen)
        const weekStartsIn = (p: { start: string; end: string }) => {
            const start = new Date(p.start)
            const end = new Date(p.end)
            let w = periodStartOf(start, 'WEEK')
            if (w.getTime() < start.getTime()) w = addPeriods(w, 'WEEK', 1)
            const weeks: Date[] = []
            for (; w.getTime() < end.getTime(); w = addPeriods(w, 'WEEK', 1)) {
                weeks.push(new Date(w))
            }
            return weeks
        }

        const lines = await this.prisma.demandForecast.findMany({
            where: {
                versionId: id,
                periodStart: { gte: rangeStart, lt: rangeEnd },
                ...(locationCode ? { locationCode } : {}),
            },
            select: {
                id: true,
                productCode: true,
                locationCode: true,
                periodStart: true,
                adjustedQty: true,
                consensusQty: true,
            },
        })
        const lineByKey = new Map(
            lines.map((l) => [
                `${l.productCode}|${l.locationCode}|${l.periodStart.getTime()}`,
                l,
            ]),
        )

        const source = `MA${window}`
        const updates: Array<{ id: string; qty: number; source: string | null; clear: boolean }> = []
        const creates: Prisma.DemandForecastCreateManyInput[] = []
        const cleared: Array<{ forecastId: string; previousQty: number | null; newQty: number }> = []
        let preservedOverrides = 0
        let frozenWeeksSkipped = 0
        const productsWithoutHistory: string[] = []

        for (const pair of pairs) {
            const pairKey = `${pair.productCode}|${pair.locationCode}`
            const hist = histByPair.get(pairKey)
            const baseline = movingAverage(
                historyKeys.map((k) => hist?.get(k) ?? null),
                window,
            )
            if (baseline == null) {
                productsWithoutHistory.push(pairKey)
                continue
            }
            for (const p of targets) {
                const weeks = weekStartsIn(p)
                const qtys =
                    bucket === 'WEEK'
                        ? [Math.max(0, Math.round(baseline))]
                        : splitAcrossWeeks(baseline, weeks.length)
                weeks.forEach((w, i) => {
                    if (w.getTime() < freezeUntil.getTime()) {
                        frozenWeeksSkipped += 1
                        return
                    }
                    const qty = qtys[i]
                    const line = lineByKey.get(`${pairKey}|${w.getTime()}`)
                    if (!line) {
                        creates.push({
                            versionId: id,
                            productCode: pair.productCode,
                            productFamily: pair.productFamily,
                            locationCode: pair.locationCode,
                            periodStart: w,
                            periodEnd: new Date(w.getTime() + 6 * 86_400_000),
                            quantity: qty,
                            unit: pair.unit,
                            source,
                        })
                        return
                    }
                    const hasOverride =
                        line.adjustedQty != null || line.consensusQty != null
                    if (hasOverride && !overwriteAdjustments) {
                        preservedOverrides += 1
                        updates.push({ id: line.id, qty, source: null, clear: false })
                    } else {
                        if (hasOverride) {
                            cleared.push({
                                forecastId: line.id,
                                previousQty: line.consensusQty ?? line.adjustedQty,
                                newQty: qty,
                            })
                        }
                        updates.push({ id: line.id, qty, source, clear: hasOverride })
                    }
                })
            }
        }

        const generatedAt = new Date()
        const generation = {
            method,
            window,
            bucket,
            horizonKind: scope.requestedKind,
            locationCode: locationCode ?? null,
            historyLength,
            historyFrom: historyFrom.toISOString(),
            historyTo: rangeStart.toISOString(),
            overwriteAdjustments,
            periodsGenerated: targets.length,
            frozenPeriodsSkipped: periods.length - targets.length,
            frozenWeeksSkipped,
            linesUpdated: updates.length,
            linesCreated: creates.length,
            preservedOverrides,
            clearedOverrides: cleared.length,
            productsWithoutHistory,
        }

        await this.prisma.$transaction(
            async (tx) => {
                const claimed = await tx.demandPlanVersion.updateMany({
                    where: { id, status: 'DRAFT' },
                    data: {
                        lastGeneratedAt: generatedAt,
                        lastGeneratedBy: actor ?? null,
                        generationParams: generation as unknown as Prisma.InputJsonValue,
                    },
                })
                if (claimed.count === 0) {
                    throw new ConflictException(
                        'Plan status changed concurrently; reload and retry',
                    )
                }
                for (let i = 0; i < updates.length; i += 1000) {
                    const values = updates
                        .slice(i, i + 1000)
                        .map(
                            (u) =>
                                Prisma.sql`(${u.id}, ${u.qty}::float8, ${u.source}::text, ${u.clear}::boolean)`,
                        )
                    await tx.$executeRaw`
                        UPDATE "DemandForecast" AS f
                        SET "quantity" = v.qty,
                            "source" = COALESCE(v.source, f."source"),
                            "adjustedQty" = CASE WHEN v.clear THEN NULL ELSE f."adjustedQty" END,
                            "consensusQty" = CASE WHEN v.clear THEN NULL ELSE f."consensusQty" END,
                            "adjustmentReason" = CASE WHEN v.clear THEN NULL ELSE f."adjustmentReason" END,
                            "updatedAt" = NOW()
                        FROM (VALUES ${Prisma.join(values)}) AS v(id, qty, source, clear)
                        WHERE f."id" = v.id AND f."versionId" = ${id}
                    `
                }
                if (creates.length) {
                    await tx.demandForecast.createMany({
                        data: creates,
                        skipDuplicates: true,
                    })
                }
                if (cleared.length) {
                    await tx.demandPlanAdjustment.createMany({
                        data: cleared.map((c) => ({
                            versionId: id,
                            forecastId: c.forecastId,
                            previousQty: c.previousQty,
                            newQty: c.newQty,
                            reason: `Override overwritten by forecast generation (${method} N=${window})`,
                            adjustedBy: actor ?? null,
                        })),
                    })
                }
                // historicalQty on each weekly line mirrors Past Sales for that week.
                const locFilter = locationCode
                    ? Prisma.sql`AND f."locationCode" = ${locationCode}`
                    : Prisma.empty
                await tx.$executeRaw`
                    UPDATE "DemandForecast" AS f
                    SET "historicalQty" = s."qty"
                    FROM "DemandSalesActual" s
                    WHERE f."versionId" = ${id}
                      AND s."productCode" = f."productCode"
                      AND s."locationCode" = f."locationCode"
                      AND s."periodStart" = f."periodStart"
                      AND f."historicalQty" IS DISTINCT FROM s."qty"
                      ${locFilter}
                `
            },
            { timeout: 60_000 },
        )

        const [detail, grid] = await Promise.all([
            this.findOne(id),
            this.grid(id, scopeQuery),
        ])
        return { generation, detail, grid }
    }

    async adjustCells(
        id: string,
        body: Record<string, unknown>,
        actor?: string,
    ) {
        const version = assertFound(
            await this.prisma.demandPlanVersion.findUnique({ where: { id } }),
            'Demand plan not found',
        )
        const reason = this.readOnlyReason(version)
        if (reason) throw new ConflictException(reason)

        const cells = Array.isArray(body.cells)
            ? (body.cells as CellAdjustment[])
            : []
        if (cells.length === 0) {
            throw new BadRequestException('cells must be a non-empty array')
        }
        if (cells.length > MAX_CELLS_PER_PATCH) {
            throw new BadRequestException(
                `At most ${MAX_CELLS_PER_PATCH} cells per request`,
            )
        }
        const adjustedBy = actor ?? null
        const freezeUntil = freezeUntilFor(
            version.bucket,
            version.freezeFencePeriods,
        )

        const parsed = cells.map((c, i) => {
            const lineId = requireString(c.lineId, `cells[${i}].lineId`)
            const cellReason = requireString(c.reason, `cells[${i}].reason`)
            let adjustedQty: number | null = null
            if (c.adjustedQty !== null && c.adjustedQty !== undefined) {
                const n = Number(c.adjustedQty)
                if (!Number.isFinite(n) || n < 0) {
                    throw new BadRequestException(
                        `cells[${i}].adjustedQty must be a number ≥ 0 or null`,
                    )
                }
                adjustedQty = n
            }
            return { lineId, reason: cellReason, adjustedQty }
        })

        return this.prisma.$transaction(async (tx) => {
            const lines = await tx.demandForecast.findMany({
                where: { id: { in: parsed.map((p) => p.lineId) } },
            })
            const byId = new Map(lines.map((l) => [l.id, l]))
            let updated = 0
            for (const p of parsed) {
                const line = byId.get(p.lineId)
                if (!line || line.versionId !== id) {
                    throw new BadRequestException(
                        `Line ${p.lineId} does not belong to this plan`,
                    )
                }
                if (line.periodStart.getTime() < freezeUntil.getTime()) {
                    throw new ConflictException(
                        `Period ${periodKey(line.periodStart)} is inside the freeze fence`,
                    )
                }
                if (line.adjustedQty === p.adjustedQty) continue
                await tx.demandForecast.update({
                    where: { id: line.id },
                    data: {
                        adjustedQty: p.adjustedQty,
                        adjustmentReason:
                            p.adjustedQty === null ? null : p.reason,
                        source: p.adjustedQty === null ? 'STAT' : 'OVERRIDE',
                    },
                })
                await tx.demandPlanAdjustment.create({
                    data: {
                        versionId: id,
                        forecastId: line.id,
                        previousQty: line.adjustedQty ?? line.quantity,
                        newQty: p.adjustedQty ?? line.quantity,
                        reason: p.reason,
                        adjustedBy,
                    },
                })
                updated += 1
            }
            return { updated }
        })
    }

    private readOnlyReason(version: {
        status: DemandPlanStatus
        horizonKind: DemandHorizonKind
    }): string | null {
        if (version.status !== 'DRAFT') {
            return `Plan is ${version.status}. Move it back to DRAFT to edit.`
        }
        if (HORIZON_PRESETS[version.horizonKind].readOnly) {
            return 'Strategic plans are aggregate and read-only.'
        }
        return null
    }

    private async aggregate(
        versionId: string,
        bucket: DemandPlanBucket,
        granularity: DemandPlanGranularity,
        from: Date,
        to: Date,
        locationCode?: string,
    ): Promise<AggRow[]> {
        // "periodStart" is timestamp(3) holding UTC; bound Dates arrive as timestamptz and
        // must be converted explicitly or the DB session time zone shifts the window.
        const unit = Prisma.raw(`'${TRUNC_UNIT[bucket]}'`)
        const keyCol =
            granularity === 'SKU'
                ? Prisma.sql`"productCode"`
                : Prisma.sql`COALESCE("productFamily", 'UNASSIGNED')`
        const locFilter = locationCode
            ? Prisma.sql`AND "locationCode" = ${locationCode}`
            : Prisma.empty
        return this.prisma.$queryRaw<AggRow[]>`
            SELECT ${keyCol} AS product_key,
                   MIN("productFamily") AS family,
                   "locationCode" AS location_code,
                   date_trunc(${unit}, "periodStart") AS period_start,
                   SUM("quantity")::float8 AS system_qty,
                   SUM(COALESCE("consensusQty", "adjustedQty", "quantity"))::float8 AS effective_qty,
                   COUNT(*)::int AS line_count,
                   COUNT("adjustedQty")::int AS adjusted_count,
                   MIN("id") AS line_id
            FROM "DemandForecast"
            WHERE "versionId" = ${versionId}
              AND "periodStart" >= (${from}::timestamptz AT TIME ZONE 'UTC')
              AND "periodStart" < (${to}::timestamptz AT TIME ZONE 'UTC')
              ${locFilter}
            GROUP BY 1, 3, 4
            ORDER BY 1, 3, 4
        `
    }

    private async nextCode(): Promise<string> {
        const now = new Date()
        const base = `DP-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
        const taken = await this.prisma.demandPlanVersion.findMany({
            where: { code: { startsWith: base } },
            select: { code: true },
        })
        if (!taken.some((t) => t.code === base)) return base
        let n = 2
        while (taken.some((t) => t.code === `${base}-${n}`)) n += 1
        return `${base}-${n}`
    }
}
