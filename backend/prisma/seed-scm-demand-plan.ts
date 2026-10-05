/**
 * SCM Demand Plan demo: one PUBLISHED and one DRAFT version with base-grain lines
 * (SKU × location × week), plus 78 weeks of Past Sales (DemandSalesActual) for the
 * same SKU × location pairs. Codes align with MM seed materials and warehouses.
 *
 *   cd backend && npm run prisma:seed-demand-plan
 *
 * Idempotent: versions upsert by code; lines are only created when a version has none.
 */
import { PrismaClient } from '@prisma/client'

const SKUS = [
    { code: 'MAT-STEEL-001', family: 'METALS', unit: 'KG', base: 420 },
    { code: 'MAT-OIL-001', family: 'MRO', unit: 'L', base: 90 },
    { code: 'MAT-GLV-001', family: 'MRO', unit: 'PCS', base: 260 },
    { code: 'MAT-BOX-001', family: 'PACKAGING', unit: 'PCS', base: 1200 },
    { code: 'MAT-LAPTOP-001', family: 'IT-HARDWARE', unit: 'PCS', base: 6 },
] as const

const LOCATIONS = [
    { code: 'MAIN', share: 1 },
    { code: 'SECONDARY', share: 0.45 },
] as const

const HISTORY_WEEKS = 12
const FUTURE_WEEKS = 104

function mondayUtc(d: Date): Date {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dow = day.getUTCDay()
    day.setUTCDate(day.getUTCDate() - (dow === 0 ? 6 : dow - 1))
    return day
}

function addDays(d: Date, days: number): Date {
    const x = new Date(d)
    x.setUTCDate(x.getUTCDate() + days)
    return x
}

function weeklyQty(
    skuIdx: number,
    locIdx: number,
    week: number,
    factor: number,
): number {
    const sku = SKUS[skuIdx]
    const loc = LOCATIONS[locIdx]
    const season = 1 + 0.15 * Math.sin((2 * Math.PI * (week + skuIdx * 5)) / 52)
    const trend = 1 + 0.002 * week
    const noise = (((skuIdx * 37 + locIdx * 11 + (week + 200) * 7) % 9) - 4) / 100
    const qty = sku.base * loc.share * season * trend * (1 + noise) * factor
    return sku.base < 20 ? Math.max(0, Math.round(qty)) : Math.round(qty)
}

function buildLines(versionId: string, familyFactor: Record<string, number>) {
    const anchor = mondayUtc(new Date())
    const rows: Array<{
        versionId: string
        productCode: string
        productFamily: string
        locationCode: string
        periodStart: Date
        periodEnd: Date
        quantity: number
        historicalQty: number | null
        unit: string
        source: string
    }> = []
    SKUS.forEach((sku, s) => {
        LOCATIONS.forEach((loc, l) => {
            for (let w = -HISTORY_WEEKS; w < FUTURE_WEEKS; w += 1) {
                const start = addDays(anchor, w * 7)
                const qty = weeklyQty(s, l, w, familyFactor[sku.family] ?? 1)
                rows.push({
                    versionId,
                    productCode: sku.code,
                    productFamily: sku.family,
                    locationCode: loc.code,
                    periodStart: start,
                    periodEnd: addDays(start, 6),
                    quantity: qty,
                    historicalQty: w < 0 ? weeklyQty(s, l, w, 1) : null,
                    unit: sku.unit,
                    source: 'STAT',
                })
            }
        })
    })
    return rows
}

export async function seedScmDemandPlan(prisma: PrismaClient) {
    const published = await prisma.demandPlanVersion.upsert({
        where: { code: 'DP-2026-09' },
        update: {},
        create: {
            code: 'DP-2026-09',
            status: 'PUBLISHED',
            horizonKind: 'OPERATIONAL',
            bucket: 'WEEK',
            viewLength: 12,
            granularity: 'SKU',
            freezeFencePeriods: 2,
            notes: 'September consensus — official demand signal.',
            createdBy: 'seed',
            approvedAt: new Date(),
            publishedAt: new Date(),
        },
    })
    const draft = await prisma.demandPlanVersion.upsert({
        where: { code: 'DP-2026-10' },
        update: {},
        create: {
            code: 'DP-2026-10',
            status: 'DRAFT',
            horizonKind: 'OPERATIONAL',
            bucket: 'WEEK',
            viewLength: 12,
            granularity: 'SKU',
            freezeFencePeriods: 2,
            notes: 'October cycle — metals up, IT hardware softening.',
            createdBy: 'seed',
        },
    })

    let created = 0
    for (const [version, factors] of [
        [published, {}],
        [draft, { METALS: 1.06, 'IT-HARDWARE': 0.9 }],
    ] as const) {
        const count = await prisma.demandForecast.count({
            where: { versionId: version.id },
        })
        if (count > 0) continue
        const rows = buildLines(version.id, factors)
        for (let i = 0; i < rows.length; i += 1000) {
            const res = await prisma.demandForecast.createMany({
                data: rows.slice(i, i + 1000),
            })
            created += res.count
        }
    }

    const hasOverrides = await prisma.demandPlanAdjustment.count({
        where: { versionId: draft.id },
    })
    if (!hasOverrides) {
        const anchor = mondayUtc(new Date())
        const overrides = [
            { sku: 'MAT-STEEL-001', loc: 'MAIN', week: 3, qty: 600, reason: 'Project Alpha fabrication order confirmed' },
            { sku: 'MAT-BOX-001', loc: 'MAIN', week: 4, qty: 1600, reason: 'Holiday packaging pre-build' },
        ]
        for (const o of overrides) {
            const line = await prisma.demandForecast.findFirst({
                where: {
                    versionId: draft.id,
                    productCode: o.sku,
                    locationCode: o.loc,
                    periodStart: addDays(anchor, o.week * 7),
                },
            })
            if (!line) continue
            await prisma.demandForecast.update({
                where: { id: line.id },
                data: {
                    adjustedQty: o.qty,
                    adjustmentReason: o.reason,
                    source: 'OVERRIDE',
                },
            })
            await prisma.demandPlanAdjustment.create({
                data: {
                    versionId: draft.id,
                    forecastId: line.id,
                    previousQty: line.quantity,
                    newQty: o.qty,
                    reason: o.reason,
                    adjustedBy: 'seed',
                },
            })
        }
    }

    const salesCreated = await seedSalesActuals(prisma)

    console.log(
        `Seeded demand plans DP-2026-09 (PUBLISHED) + DP-2026-10 (DRAFT); ${created} new forecast lines; ${salesCreated} new past-sales weeks.`,
    )
}

/** 18 months of weekly actuals for the same SKU × location pairs as the plan lines. */
const SALES_HISTORY_WEEKS = 78

async function seedSalesActuals(prisma: PrismaClient) {
    const anchor = mondayUtc(new Date())
    const rows: Array<{
        productCode: string
        locationCode: string
        periodStart: Date
        periodEnd: Date
        qty: number
        unit: string
        source: string
    }> = []
    SKUS.forEach((sku, s) => {
        LOCATIONS.forEach((loc, l) => {
            for (let w = -SALES_HISTORY_WEEKS; w < 0; w += 1) {
                const start = addDays(anchor, w * 7)
                rows.push({
                    productCode: sku.code,
                    locationCode: loc.code,
                    periodStart: start,
                    periodEnd: addDays(start, 6),
                    qty: weeklyQty(s, l, w, 1),
                    unit: sku.unit,
                    source: 'SEED',
                })
            }
        })
    })
    let created = 0
    for (let i = 0; i < rows.length; i += 1000) {
        const res = await prisma.demandSalesActual.createMany({
            data: rows.slice(i, i + 1000),
            skipDuplicates: true,
        })
        created += res.count
    }
    // Plan lines' historicalQty mirrors Past Sales for the same week.
    await prisma.$executeRaw`
        UPDATE "DemandForecast" AS f
        SET "historicalQty" = s."qty"
        FROM "DemandSalesActual" s
        WHERE s."productCode" = f."productCode"
          AND s."locationCode" = f."locationCode"
          AND s."periodStart" = f."periodStart"
          AND f."historicalQty" IS DISTINCT FROM s."qty"
    `
    return created
}

if (require.main === module) {
    const prisma = new PrismaClient()
    seedScmDemandPlan(prisma)
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
        .finally(() => prisma.$disconnect())
}
