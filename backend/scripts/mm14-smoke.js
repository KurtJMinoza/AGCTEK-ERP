/**
 * MM-14 smoke: demand/ROP → MRP run → requirement + suggestion → convert DRAFT PR
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
  const company = await p.company.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!company) throw new Error('Need a company')

  const warehouse = await p.warehouse.findFirst({
    where: { companyId: company.id, status: 'ACTIVE' },
  })
  if (!warehouse) throw new Error('Need an ACTIVE warehouse')

  let material = await p.mmMaterial.findFirst({
    where: {
      companyId: company.id,
      inventoryManaged: true,
      status: 'ACTIVE',
      purchasable: true,
    },
  })
  if (!material) {
    material = await p.mmMaterial.findFirst({
      where: { inventoryManaged: true, status: 'ACTIVE' },
    })
  }
  if (!material) throw new Error('Need an inventory-managed material')

  // Ensure planning signals: ROP + safety + planning demand
  await p.mmMaterial.update({
    where: { id: material.id },
    data: {
      reorderPoint: 100,
      safetyStock: 20,
      reorderQuantity: 50,
      minimumOrderQuantity: 25,
      leadTimeDays: 5,
      companyId: company.id,
    },
  })

  const demandDate = new Date()
  demandDate.setDate(demandDate.getDate() + 3)

  const demand = await j('POST', '/mm/planning/demand', {
    companyId: company.id,
    warehouseId: warehouse.id,
    materialId: material.id,
    demandDate: demandDate.toISOString(),
    quantity: 40,
    sourceType: 'MANUAL',
    remarks: 'mm14-smoke',
  })
  console.log('demand', demand.id)

  const run = await j('POST', '/mm/planning/mrp-runs', {
    companyId: company.id,
    warehouseId: warehouse.id,
    planningHorizonDays: 30,
    includeOpenReceipts: true,
    executeImmediately: true,
    createdBy: 'mm14-smoke',
  })
  console.log('run', run.runNumber, run.status, {
    req: run._count?.requirements ?? run.requirements?.length,
    sug: run._count?.suggestions ?? run.suggestions?.length,
  })
  if (run.status !== 'COMPLETED') {
    throw new Error(`Expected COMPLETED, got ${run.status}: ${run.errorMessage}`)
  }

  const reqs = await j('GET', `/mm/planning/material-requirements?mrpRunId=${run.id}&limit=50`)
  const myReq = (reqs.data || []).find((r) => r.materialId === material.id)
  if (!myReq) throw new Error('No material requirement for smoke material')
  console.log('requirement', {
    available: Number(myReq.availableQty),
    demand: Number(myReq.demandQty),
    net: Number(myReq.netRequirement),
    recommended: Number(myReq.recommendedQty),
    belowRop: myReq.belowReorderPoint,
    shortage: myReq.shortage,
  })
  if (Number(myReq.recommendedQty) <= 0 && !myReq.belowReorderPoint && !myReq.shortage) {
    throw new Error('Expected recommendation or shortage/ROP signal')
  }

  const sugs = await j(
    'GET',
    `/mm/planning/suggestions?mrpRunId=${run.id}&status=OPEN&limit=50`,
  )
  const sug = (sugs.data || []).find((s) => s.materialId === material.id)
  if (!sug) throw new Error('No OPEN procurement suggestion')
  console.log('suggestion', sug.id, Number(sug.quantity), sug.suggestionType)

  const converted = await j('POST', `/mm/planning/suggestions/${sug.id}/convert-pr`, {
    requesterId: 'mm14-smoke',
    purpose: 'MM-14 smoke convert',
    estimatedUnitPrice: 1,
  })
  const pr = converted.purchaseRequisition
  if (!pr || pr.status !== 'DRAFT') {
    throw new Error(`Expected DRAFT PR, got ${pr?.status}`)
  }
  console.log('PR', pr.requisitionNumber, pr.status)

  // Ensure no PO was auto-created from this suggestion
  const linkedPo = await p.mmPurchaseOrder.findFirst({
    where: {
      lines: { some: { remarks: { contains: sug.id } } },
    },
  })
  if (linkedPo) throw new Error('Unexpected PO created from suggestion')

  const dash = await j(
    'GET',
    `/mm/planning/dashboard?companyId=${company.id}&warehouseId=${warehouse.id}`,
  )
  console.log('dashboard', dash.summary)

  console.log('MM-14 smoke OK')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
