import { PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client'

/**
 * Removes all Sales & Distribution data (sd_* tables).
 */
export async function purgeSalesDistributionData(prisma: PrismaClientType) {
    console.log('Purging Sales & Distribution data …')

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'sd_%'
        ORDER BY tablename
    `

    if (tables.length > 0) {
        const quoted = tables.map((t) => `"${t.tablename}"`).join(', ')
        await prisma.$executeRawUnsafe(
            `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
        )
        console.log(`  Truncated ${tables.length} SD table(s).`)
    } else {
        console.log('  No sd_* tables found.')
    }

    console.log('SD purge complete.')
}

/** @deprecated use purgeSalesDistributionData */
export const purgeSalesDistributionDemoData = purgeSalesDistributionData

if (require.main === module) {
    const prisma = new PrismaClient()
    purgeSalesDistributionData(prisma)
        .catch((err: unknown) => {
            console.error(err)
            process.exitCode = 1
        })
        .finally(() => prisma.$disconnect())
}
