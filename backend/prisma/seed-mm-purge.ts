import type { PrismaClient } from '@prisma/client'

/** MM master tables preserved when purging (units of measure only). */
export const MM_PURGE_PRESERVE_TABLES = new Set([
    'mm_uoms',
    'mm_uom_conversions',
])

/**
 * Removes Materials Management transactional + master data (mm_* / wm_* tables)
 * except UOM master (`mm_uoms`, `mm_uom_conversions`), then deletes warehouses.
 */
export async function purgeMaterialsManagementData(prisma: PrismaClient) {
    console.log(
        'Purging Materials Management data (mm_* / wm_* + warehouses); keeping UOM …',
    )

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'mm_%' OR tablename LIKE 'wm_%')
        ORDER BY tablename
    `

    const toTruncate = tables.filter(
        (t) => !MM_PURGE_PRESERVE_TABLES.has(t.tablename),
    )

    if (toTruncate.length > 0) {
        const quoted = toTruncate.map((t) => `"${t.tablename}"`).join(', ')
        await prisma.$executeRawUnsafe(
            `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
        )
        console.log(
            `  Truncated ${toTruncate.length} MM / WM table(s); preserved: ${[...MM_PURGE_PRESERVE_TABLES].join(', ')}.`,
        )
    }

    const wh = await prisma.warehouse.deleteMany({})
    console.log(`  Deleted ${wh.count} warehouse(s).`)

    const uomCount = await prisma.mmUom.count()
    const convCount = await prisma.mmUomConversion.count()
    console.log(`  Remaining: ${uomCount} UOM(s), ${convCount} conversion(s).`)

    console.log('MM purge complete.')
}
