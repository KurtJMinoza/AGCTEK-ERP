/**
 * MM-11 smoke: rule → generate → start → blind → variance → recount →
 * approve → post → assert balance + ledger + accounting event.
 *
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
  if (!r.ok) throw new Error(`${m} ${path} ${r.status} ${t.slice(0, 500)}`)
  return d
}

async function main() {
  const mat = await p.mmMaterial.findFirst({
    where: { deletedAt: null, inventoryManaged: true, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  })
  if (!mat) throw new Error('no material')

  const bin = await p.wmStorageBin.findFirst({
    where: { deletedAt: null },
    include: { storageSection: { include: { storageType: true } } },
  })
  if (!bin) throw new Error('no bin')

  const warehouseId = bin.storageSection.storageType.warehouseId
  const companyId = mat.companyId
  const materialId = mat.id
  const storageBinId = bin.id

  await p.mmMaterial.update({
    where: { id: materialId },
    data: { abcClass: 'A', deletedAt: null },
  })

  let bal = await p.mmInventoryBalance.findFirst({
    where: {
      companyId,
      warehouseId,
      materialId,
      storageBinId,
      stockStatus: 'UNRESTRICTED',
      batchId: null,
      serialNumberId: null,
    },
  })
  if (!bal) {
    bal = await p.mmInventoryBalance.create({
      data: {
        companyId,
        warehouseId,
        materialId,
        storageBinId,
        stockStatus: 'UNRESTRICTED',
        quantity: 50,
        reservedQuantity: 0,
        availableQuantity: 50,
      },
    })
  } else if (Number(bal.availableQuantity) < 10) {
    bal = await p.mmInventoryBalance.update({
      where: { id: bal.id },
      data: {
        quantity: 50,
        reservedQuantity: 0,
        availableQuantity: 50,
      },
    })
  }

  const systemQty = Number(bal.quantity)
  const countedQty = systemQty - 2
  console.log('prepared', {
    materialId,
    warehouseId,
    storageBinId,
    systemQty,
    countedQty,
  })

  const code = 'SMK-A-' + Date.now().toString(36).toUpperCase()
  const rule = await j('POST', '/mm/inventory-control/count-rules', {
    code,
    name: 'Smoke ABC-A weekly',
    companyId,
    warehouseId,
    abcClass: 'A',
    frequencyDays: 7,
    varianceQtyTolerance: 0,
    varianceValueTolerance: 0,
    priority: 1,
    isActive: true,
  })
  console.log('rule', rule.code)

  // PHYSICAL scoped to one bin keeps the line set small for smoke
  const session = await j('POST', '/mm/inventory-control/counts', {
    countType: 'PHYSICAL',
    companyId,
    warehouseId,
    createdBy: 'smoke',
  })
  console.log('session', session.countNumber, session.status)

  const generated = await j(
    'POST',
    `/mm/inventory-control/counts/${session.id}/generate`,
    { storageBinIds: [storageBinId] },
  )
  console.log('generated lines', generated.lines?.length)
  if (!generated.lines?.length) throw new Error('no lines generated')

  const line =
    generated.lines.find(
      (l) => l.materialId === materialId && l.storageBinId === storageBinId,
    ) || generated.lines[0]
  console.log('target line', line.id)

  await j('POST', `/mm/inventory-control/counts/${session.id}/start`, {})
  console.log('started COUNTING')

  const keyBase = 'mm11-' + Date.now()
  let blind
  for (const l of generated.lines) {
    const dbLine = await p.mmInventoryCountLine.findUnique({ where: { id: l.id } })
    const qty =
      l.id === line.id
        ? Number(dbLine.systemQuantity) - 2
        : Number(dbLine.systemQuantity)
    const res = await j(
      'POST',
      `/mm/inventory-control/count-lines/${l.id}/blind-count`,
      {
        countedQuantity: qty,
        countedBy: 'counter-1',
        idempotencyKey: `${keyBase}-${l.id}`,
      },
    )
    if (res.systemQuantity !== undefined) {
      throw new Error('blind response leaked systemQuantity')
    }
    if (l.id === line.id) blind = res
  }
  console.log('blind', blind.status, 'counted', blind.countedQuantity)

  const afterVar = await j(
    'POST',
    `/mm/inventory-control/counts/${session.id}/compute-variances`,
    {},
  )
  console.log('variance status', afterVar.status)
  if (afterVar.status !== 'RECOUNT') {
    throw new Error(`expected RECOUNT, got ${afterVar.status}`)
  }
  const needRecount = afterVar.lines.find((l) => l.id === line.id)
  if (needRecount.status !== 'REQUIRE_RECOUNT') {
    throw new Error(`expected REQUIRE_RECOUNT, got ${needRecount.status}`)
  }

  await j('POST', `/mm/inventory-control/count-lines/${line.id}/recount`, {
    recountQuantity: countedQty,
    recountBy: 'supervisor',
  })
  console.log('recounted')

  const approval = await j(
    'POST',
    `/mm/inventory-control/counts/${session.id}/submit-approval`,
    {},
  )
  console.log('submit-approval', approval.status)

  await j('POST', `/mm/inventory-control/counts/${session.id}/approve`, {
    approvedBy: 'approver',
  })
  console.log('approved')

  const posted = await j(
    'POST',
    `/mm/inventory-control/counts/${session.id}/post-adjustments`,
    {
      approvedBy: 'approver',
      adjustmentReason: 'COUNT_VARIANCE',
    },
  )
  console.log('posted', posted.status)
  if (posted.status !== 'POSTED') {
    throw new Error(`expected POSTED, got ${posted.status}`)
  }

  const balAfter = await p.mmInventoryBalance.findUnique({ where: { id: bal.id } })
  const qtyAfter = Number(balAfter.quantity)
  console.log('balance', systemQty, '→', qtyAfter)
  if (qtyAfter !== systemQty - 2) {
    throw new Error(`expected qty ${systemQty - 2}, got ${qtyAfter}`)
  }

  const adj = await p.mmInventoryAdjustment.findFirst({
    where: { sourceCountId: session.id },
  })
  if (!adj) throw new Error('adjustment not linked to count')

  const ledger = await p.mmInventoryTransaction.findFirst({
    where: {
      sourceDocumentId: adj.id,
      movementType: 'COUNT_LOSS',
    },
  })
  if (!ledger) throw new Error('COUNT_LOSS ledger missing')
  console.log('ledger', ledger.movementType, Number(ledger.quantity))

  const evt = await p.mmAccountingEvent.findFirst({
    where: {
      documentId: adj.id,
      eventType: 'INVENTORY_COUNT_ADJUSTMENT_POSTED',
    },
  })
  if (!evt) throw new Error('accounting event missing')
  console.log('accounting event', evt.eventType)

  // Blind GET must omit system qty
  const blindView = await j(
    'GET',
    `/mm/inventory-control/counts/${session.id}?blind=true`,
  )
  if (blindView.lines?.some((l) => l.systemQuantity !== undefined)) {
    throw new Error('blind session view leaked systemQuantity')
  }
  console.log('blind view OK')

  console.log('SMOKE OK')
}

main()
  .catch((e) => {
    console.error('SMOKE FAIL', e.message)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
