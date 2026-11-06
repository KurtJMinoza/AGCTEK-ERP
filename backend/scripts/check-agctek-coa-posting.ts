import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

async function main() {
  const p = new PrismaClient()

  const agctekChart = await p.ficoChartOfAccounts.findUnique({
    where: { code: 'AGCTEK_COA' },
    select: { id: true, code: true, name: true, accountCodeLength: true },
  })
  if (!agctekChart) {
    console.log('AGCTEK_COA not found')
    await p.$disconnect()
    return
  }

  console.log(`AGCTEK_COA id=${agctekChart.id} name=${agctekChart.name} length=${agctekChart.accountCodeLength}`)

  const companies = await p.company.findMany({ select: { id: true, code: true } })
  console.log('COMPANIES:')
  for (const c of companies) console.log(`  - ${c.code} id=${c.id}`)

  const settings = await p.ficoCompanyAccountingSettings.findMany({
    select: {
      id: true,
      companyId: true,
      status: true,
      chartOfAccountsId: true,
      accountDeterminationProfileId: true,
      company: { select: { id: true, code: true } },
      chartOfAccounts: { select: { id: true, code: true } },
    },
  })
  console.log('COMPANY SETTINGS:')
  for (const s of settings) console.log(`  - company=${s.company.code} id=${s.companyId} status=${s.status} chart=${s.chartOfAccounts?.code ?? '—'} profile=${s.accountDeterminationProfileId ?? '—'}`)

  // Focused codes that matter for the MM↔FICO path, plus a couple of AP/AR samples
  const focusCodes = ['110100', '110200', '110300', '120100', '130100', '210100', '210200', '220100', '310200', '410100', '510100', '510400', '520100']

  const accounts = await p.ficoGlAccount.findMany({
    where: { chartOfAccountsId: agctekChart.id, accountCode: { in: focusCodes } },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      normalBalance: true,
      isPostingAccount: true,
      allowManualPosting: true,
      allowAutomaticPosting: true,
      status: true,
      companyAssignments: {
        where: { postingEnabled: true },
        select: { companyId: true },
      },
      _count: { select: { companyAssignments: true } },
    },
    orderBy: { accountCode: 'asc' },
  })

  console.log('\nAGCTEK_COA ACCOUNTS (posting-relevant subset):')
  for (const a of accounts) {
    const assignedCodes = (await p.company.findMany({ where: { id: { in: a.companyAssignments.map((x) => x.companyId) } }, select: { code: true } })).map((c) => c.code)
    console.log(
      `  - ${a.accountCode} ${a.accountName} | type=${a.accountType} normal=${a.normalBalance} status=${a.status} posting=${a.isPostingAccount} auto=${a.allowAutomaticPosting} manual=${a.allowManualPosting} assignedCompanyCount=${a._count.companyAssignments} assignedCompanies=[${assignedCodes.join(',')}]`
    )
  }

  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
