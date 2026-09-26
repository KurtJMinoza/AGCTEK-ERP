import type { PrismaClient } from '@prisma/client'

/**
 * Removes all Materials Management transactional + master data (mm_* / wm_* tables)
 * and MM warehouse topology rows, then leaves Company / Plant / Branch intact for re-seed.
 */
export async function purgeMaterialsManagementData(prisma: PrismaClient) {
    console.log('Purging Materials Management data (mm_* / wm_* + warehouses) …')

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'mm_%' OR tablename LIKE 'wm_%')
        ORDER BY tablename
    `

    if (tables.length > 0) {
        const quoted = tables.map((t) => `"${t.tablename}"`).join(', ')
        await prisma.$executeRawUnsafe(
            `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
        )
        console.log(`  Truncated ${tables.length} MM / WM tables.`)
    }

    const wh = await prisma.warehouse.deleteMany({})
    console.log(`  Deleted ${wh.count} warehouse(s).`)

    console.log('MM purge complete.')
}
