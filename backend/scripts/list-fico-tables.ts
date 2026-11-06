import { PrismaClient } from '@prisma/client'

async function main() {
  const p = new PrismaClient()
  try {
    const rows = await p.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'fico%'
      ORDER BY c.relname
    `
    console.log(rows.map(r => r.relname).join('\n'))
  } finally {
    await p.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
