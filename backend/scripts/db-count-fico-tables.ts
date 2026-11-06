import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function count(table: string) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "${table}"`
  )
  return (rows as Array<{ cnt: number }>)[0].cnt
}

async function main() {
  const [charts, groups, accounts, valuation, keys, mappings, settings, profiles, rules, lines] =
    await Promise.all([
      count('fico_charts_of_accounts'),
      count('fico_gl_account_groups'),
      count('fico_gl_accounts'),
      count('mm_valuation_classes'),
      count('fico_transaction_keys'),
      count('fico_mm_account_mappings'),
      count('fico_company_accounting_settings'),
      count('fico_account_determination_profiles'),
      count('fico_account_determination_rules'),
      count('fico_account_determination_lines'),
    ])

  console.log([
    ['fico_charts_of_accounts', charts],
    ['fico_gl_account_groups', groups],
    ['fico_gl_accounts', accounts],
    ['mm_valuation_classes', valuation],
    ['fico_transaction_keys', keys],
    ['fico_mm_account_mappings', mappings],
    ['fico_company_accounting_settings', settings],
    ['fico_account_determination_profiles', profiles],
    ['fico_account_determination_rules', rules],
    ['fico_account_determination_lines', lines],
  ].map(([t, c]) => `${t}: ${c}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(() => prisma.$disconnect())
