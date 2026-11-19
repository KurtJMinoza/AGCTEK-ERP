/**
 * Sales Analysis scorecard: 2026 monthly sales targets and collection quotas.
 *
 *   cd backend && npm run prisma:seed-sd-sales-targets
 *
 * Idempotent: one row per (year, month) is upserted, so re-running resets the
 * 2026 figures to the values below. Other years are not touched.
 */
import { PrismaClient } from '@prisma/client'

const YEAR = 2026

/** January–May, then June–December (month 1 = January). */
const SALES_TARGETS = [
    ...Array<number>(5).fill(1_250_000),
    ...Array<number>(7).fill(2_000_000),
]
const COLLECTION_QUOTAS = [
    ...Array<number>(5).fill(1_000_000),
    ...Array<number>(7).fill(1_500_000),
]

export async function seedSdSalesTargets(prisma: PrismaClient) {
    for (let index = 0; index < 12; index += 1) {
        const month = index + 1
        await prisma.sdSalesTarget.upsert({
            where: { year_month: { year: YEAR, month } },
            create: {
                year: YEAR,
                month,
                salesTarget: SALES_TARGETS[index],
                collectionQuota: COLLECTION_QUOTAS[index],
                updatedBy: 'seed',
            },
            update: {
                salesTarget: SALES_TARGETS[index],
                collectionQuota: COLLECTION_QUOTAS[index],
                updatedBy: 'seed',
            },
        })
    }
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
    console.log(
        `Seeded ${YEAR} targets: sales ${sum(SALES_TARGETS).toLocaleString('en-PH')}, collection quota ${sum(COLLECTION_QUOTAS).toLocaleString('en-PH')}`,
    )
}

if (require.main === module) {
    const prisma = new PrismaClient()
    seedSdSalesTargets(prisma)
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
        .finally(() => prisma.$disconnect())
}
