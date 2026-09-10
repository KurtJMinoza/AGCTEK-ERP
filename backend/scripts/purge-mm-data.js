/**
 * Purge all Materials Management data except mm_uoms and mm_uom_conversions.
 *
 * Usage: node scripts/purge-mm-data.js
 * Requires DATABASE_URL (loads backend/.env via Prisma).
 */
const { PrismaClient } = require('@prisma/client')

const PRESERVE_TABLES = new Set(['mm_uoms', 'mm_uom_conversions'])

const prisma = new PrismaClient()

async function countTable(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "${table}"`,
  )
  return rows[0]?.count ?? 0
}

async function listMmTables() {
  const rows = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'mm_%'
        OR tablename LIKE 'wm_%'
        OR tablename IN ('companies', 'plants', 'branches', 'warehouses')
      )
    ORDER BY tablename
  `
  return rows.map((r) => r.tablename)
}

async function main() {
  const allTables = await listMmTables()
  const purgeTables = allTables.filter((t) => !PRESERVE_TABLES.has(t))

  console.log('=== MM data purge (preserve UOM + UOM conversions) ===\n')

  console.log('Before:')
  for (const table of allTables) {
    const count = await countTable(table)
    if (count > 0) {
      console.log(`  ${table}: ${count}`)
    }
  }

  const nulled = await prisma.$executeRaw`
    UPDATE mm_uom_conversions
    SET "materialId" = NULL
    WHERE "materialId" IS NOT NULL
  `
  console.log(`\nCleared materialId on ${nulled} UOM conversion row(s).`)

  // Prevent TRUNCATE mm_materials CASCADE from wiping mm_uom_conversions.
  await prisma.$executeRaw`
    ALTER TABLE mm_uom_conversions
    DROP CONSTRAINT IF EXISTS mm_uom_conversions_materialId_fkey
  `
  console.log('Dropped mm_uom_conversions → material FK for safe truncate.')

  if (purgeTables.length === 0) {
    console.log('\nNo tables to purge.')
    return
  }

  const quoted = purgeTables.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  )

  await prisma.$executeRaw`
    ALTER TABLE mm_uom_conversions
    ADD CONSTRAINT mm_uom_conversions_materialId_fkey
    FOREIGN KEY ("materialId") REFERENCES mm_materials(id)
    ON DELETE SET NULL ON UPDATE CASCADE
  `.catch(() => {
    // FK restore is optional when mm_materials is empty.
  })

  console.log(`\nTruncated ${purgeTables.length} table(s).`)

  console.log('\nAfter:')
  for (const table of allTables) {
    const count = await countTable(table)
    const label = PRESERVE_TABLES.has(table) ? ' (preserved)' : ''
    console.log(`  ${table}: ${count}${label}`)
  }

  console.log('\nPurge complete.')
}

main()
  .catch((err) => {
    console.error('Purge failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
