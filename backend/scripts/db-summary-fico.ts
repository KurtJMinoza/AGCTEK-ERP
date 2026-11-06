import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

async function main() {
  const p = new PrismaClient()

  const charts = await p.ficoChartOfAccounts.findMany({
    select: { id: true, code: true, name: true, countryCode: true, accountCodeLength: true, status: true },
    orderBy: { code: 'asc' },
    where: { status: 'ACTIVE' },
  })

  console.log('ACTIVE CHARTS')
  for (const c of charts as Array<{ id: string; code: string; name: string; countryCode: string; accountCodeLength: number | null; status: string }>) {
    const groups = await p.ficoGlAccountGroup.count({ where: { chartOfAccountsId: c.id } })
    const accounts = await p.ficoGlAccount.count({ where: { chartOfAccountsId: c.id } })
    console.log(`  - ${c.code} | ${c.name} | country=${c.countryCode} | length=${c.accountCodeLength} | groups=${groups} | accounts=${accounts}`)
  }

  console.log('\nCOMPANY ACCOUNTING SETTINGS')
  const settings = await p.ficoCompanyAccountingSettings.findMany({
    select: {
      id: true,
      companyId: true,
      status: true,
      baseCurrency: true,
      countryCode: true,
      chartOfAccounts: { select: { id: true, code: true } },
      accountDeterminationProfile: { select: { id: true, code: true, name: true, status: true } },
      fiscalYearVariant: { select: { id: true, code: true } },
      postingPeriodVariant: { select: { id: true, code: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const s of settings as Array<{
    companyId: string
    status: string
    baseCurrency: string
    countryCode: string
    chartOfAccounts: { code: string | null }
    accountDeterminationProfile: { code: string | null; status: string | null }
  }>) {
    console.log(`  - companyId=${s.companyId} status=${s.status} currency=${s.baseCurrency} country=${s.countryCode} chart=${s.chartOfAccounts?.code ?? '—'} profile=${s.accountDeterminationProfile?.code ?? '—'} profileStatus=${s.accountDeterminationProfile?.status ?? '—'}`)
  }

  console.log('\nMM VALUATION CLASSES')
  const vclasses = await p.mmValuationClass.findMany({ orderBy: { code: 'asc' } })
  for (const v of vclasses as Array<{ code: string; name: string }>) console.log(`  - ${v.code} | ${v.name}`)

  console.log('\nTRANSACTION KEYS')
  const keys = await p.ficoTransactionKey.findMany({ orderBy: { sortOrder: 'asc' } })
  for (const k of keys as Array<{ code: string; name: string; requiresValuationClass: boolean; inventorySide: string; status: string }>)
    console.log(`  - ${k.code} | ${k.name} | requiresValuationClass=${k.requiresValuationClass} inventorySide=${k.inventorySide} status=${k.status}`)

  console.log('\nMM ACCOUNT MAPPINGS (company-scoped)')
  const mappingIds = await p.ficoMmAccountMapping.findMany({
    select: { id: true, companyId: true, profileId: true, transactionKeyCode: true, valuationScopeKey: true, valuationClassId: true, debitAccountId: true, creditAccountId: true, status: true },
    orderBy: [{ companyId: 'asc' }, { transactionKeyCode: 'asc' }, { valuationScopeKey: 'asc' }],
  })
  const profileMap = new Map<string, { code: string }>()
  const vcMap = new Map<string, { code: string | null }>()
  const debitMap = new Map<string, { accountCode: string; accountName: string }>()
  const creditMap = new Map<string, { accountCode: string; accountName: string }>()
  const profileIds = new Set<string>()
  const vcIds = new Set<string>()
  const debitIds = new Set<string>()
  const creditIds = new Set<string>()
  for (const m of mappingIds as Array<{
    companyId: string
    profileId: string
    transactionKeyCode: string
    valuationScopeKey: string
    valuationClassId: string | null
    debitAccountId: string
    creditAccountId: string
    status: string
  }>) {
    profileIds.add(m.profileId)
    if (m.valuationClassId) vcIds.add(m.valuationClassId)
    debitIds.add(m.debitAccountId)
    creditIds.add(m.creditAccountId)
  }
  await Promise.all([
    p.ficoAccountDeterminationProfile.findMany({ where: { id: { in: [...profileIds] } }, select: { id: true, code: true } }).then((rows) => rows.forEach((row) => profileMap.set(row.id, { code: row.code }))),
    p.mmValuationClass.findMany({ where: { id: { in: [...vcIds] } }, select: { id: true, code: true } }).then((rows) => rows.forEach((row) => vcMap.set(row.id, { code: row.code }))),
    p.ficoGlAccount.findMany({ where: { id: { in: [...debitIds, ...creditIds] } }, select: { id: true, accountCode: true, accountName: true } }).then((rows) => rows.forEach((row) => { debitMap.set(row.id, { accountCode: row.accountCode, accountName: row.accountName }); creditMap.set(row.id, { accountCode: row.accountCode, accountName: row.accountName }); }))
  ])
  for (const m of mappingIds as Array<{
    companyId: string
    profileId: string
    transactionKeyCode: string
    valuationScopeKey: string
    valuationClassId: string | null
    debitAccountId: string
    creditAccountId: string
    status: string
  }>) {
    const vc = vcMap.get(m.valuationClassId ?? '')?.code ?? '*'
    const db = debitMap.get(m.debitAccountId) ?? { accountCode: '?', accountName: '?' }
    const cr = creditMap.get(m.creditAccountId) ?? { accountCode: '?', accountName: '?' }
    console.log(`  - companyId=${m.companyId} profile=${profileMap.get(m.profileId)?.code ?? '?'} key=${m.transactionKeyCode} valuationScope=${vc} debit=${db.accountCode} (${db.accountName}) credit=${cr.accountCode} (${cr.accountName}) status=${m.status}`)
  }

  console.log('\nDETERMINATION RULES')
  const ruleRows = (await p.ficoAccountDeterminationRule.findMany({
    select: { determinationCode: true, name: true, sourceModule: true, transactionType: true, status: true, valuationClassId: true, lines: { select: { lineNumber: true, side: true, glAccountId: true, description: true }, orderBy: { lineNumber: 'asc' } } },
    orderBy: { determinationCode: 'asc' },
  })) as unknown as Array<{
    determinationCode: string
    name: string
    sourceModule: string
    transactionType: string
    status: string
    valuationClassId: string | null
    lines: Array<{ lineNumber: number; side: string; glAccountId: string; description: string | null }>
  }>
  const ruleVcMap = new Map<string, { code: string | null }>()
  const ruleGlMap = new Map<string, { accountCode: string; accountName: string }>()
  const ruleVcIds = new Set<string>()
  const ruleGlIds = new Set<string>()
  for (const r of ruleRows) {
    if (r.valuationClassId) ruleVcIds.add(r.valuationClassId)
    for (const l of r.lines) ruleGlIds.add(l.glAccountId)
  }
  await Promise.all([
    p.mmValuationClass.findMany({ where: { id: { in: [...ruleVcIds] } }, select: { id: true, code: true } }).then((rows) => rows.forEach((row) => ruleVcMap.set(row.id, { code: row.code }))),
    p.ficoGlAccount.findMany({ where: { id: { in: [...ruleGlIds] } }, select: { id: true, accountCode: true, accountName: true } }).then((rows) => rows.forEach((row) => ruleGlMap.set(row.id, { accountCode: row.accountCode, accountName: row.accountName })))
  ])
  for (const r of ruleRows) {
    const vc = ruleVcMap.get(r.valuationClassId ?? '')?.code ?? '—'
    console.log(`  - ${r.determinationCode} | ${r.name} | module=${r.sourceModule} type=${r.transactionType} status=${r.status} valuationClass=${vc}`)
    for (const l of r.lines) {
      const gl = ruleGlMap.get(l.glAccountId) ?? { accountCode: '?', accountName: '?' }
      console.log(`      ${l.side} ${gl.accountCode} ${gl.accountName}${l.description ? ' — ' + l.description : ''}`)
    }
  }

  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
