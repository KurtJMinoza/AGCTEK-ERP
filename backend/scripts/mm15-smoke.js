/**
 * MM-15 smoke: run evaluation → dashboard → alert when below threshold → acknowledge
 * Requires Nest API on http://localhost:3001
 */
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const base = 'http://localhost:3001/api/v1'

async function j(m, path, body) {
  const r = await fetch(base + path, {
    method: m,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : m === 'GET' ? undefined : '{}',
  })
  const t = await r.text()
  let d
  try {
    d = JSON.parse(t)
  } catch {
    d = t
  }
  if (!r.ok) throw new Error(`${m} ${path} ${r.status} ${t.slice(0, 600)}`)
  return d
}

async function main() {
  const gr = await p.mmGoodsReceipt.findFirst({
    where: { status: 'POSTED', supplierId: { not: null } },
    orderBy: { postingDate: 'desc' },
  })
  if (!gr || !gr.supplierId) throw new Error('Need a POSTED GR with supplier')

  const companyId = gr.companyId
  const supplierId = gr.supplierId
  const supplier = await p.mmSupplier.findUnique({ where: { id: supplierId } })
  console.log('supplier', supplier.supplierCode, 'company', companyId)

  const periodEnd = new Date()
  const periodStart = new Date()
  periodStart.setFullYear(periodStart.getFullYear() - 1)

  await j('PATCH', '/mm/supplier-performance/alert-config', {
    companyId,
    scoreThreshold: 99.9,
    isActive: true,
  })

  const run = await j('POST', '/mm/supplier-performance/evaluations/run', {
    companyId,
    supplierId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  })
  console.log('evaluated', run.evaluated)
  if (!run.evaluated) throw new Error('No suppliers evaluated')

  const ev = run.data[0]
  console.log('score', Number(ev.overallScore), {
    delivery: Number(ev.deliveryScore),
    quality: Number(ev.qualityScore),
    price: Number(ev.priceScore),
  })

  const dash = await j(
    'GET',
    `/mm/supplier-performance/dashboard?companyId=${companyId}`,
  )
  console.log('dashboard', dash.summary)

  const trends = await j(
    'GET',
    `/mm/supplier-performance/trends?companyId=${companyId}&supplierId=${supplierId}&periods=6`,
  )
  console.log('trend points', trends.data?.length ?? 0)

  // With threshold 99.9 almost any score creates an alert
  const alerts = await j(
    'GET',
    `/mm/supplier-performance/alerts?companyId=${companyId}&supplierId=${supplierId}&status=OPEN`,
  )
  const alert = (alerts.data || []).find((a) => a.evaluationId === ev.id)
  if (!alert && Number(ev.overallScore) < 99.9) {
    throw new Error('Expected OPEN alert for score below threshold')
  }
  if (alert) {
    console.log('alert', alert.id, alert.message)
    await j('POST', `/mm/supplier-performance/alerts/${alert.id}/acknowledge`, {})
    console.log('alert acknowledged')
  }

  const after = await p.mmSupplier.findUnique({ where: { id: supplierId } })
  if (after.status === 'BLOCKED' && supplier.status !== 'BLOCKED') {
    throw new Error('Supplier was auto-blocked — forbidden')
  }

  // restore default threshold
  await j('PATCH', '/mm/supplier-performance/alert-config', {
    companyId,
    scoreThreshold: 70,
    isActive: true,
  })

  console.log('MM-15 smoke OK')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
