/**
 * MM-12 smoke: STANDARD / MAP / FIFO receipt → issue → reverse
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

async function postTxn(body) {
  return j('POST', '/mm/inventory/post', body)
}

async function reverseTxn(id) {
  return j('POST', `/mm/inventory/${id}/reverse`, { reasonCode: 'SMOKE' })
}

async function main() {
  const mat = await p.mmMaterial.findFirst({
    where: { inventoryManaged: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (!mat) throw new Error('no material')
  if (mat.deletedAt || mat.status !== 'ACTIVE') {
    await p.mmMaterial.update({
      where: { id: mat.id },
      data: { deletedAt: null, status: 'ACTIVE' },
    })
  }
  const bin = await p.wmStorageBin.findFirst({
    where: { deletedAt: null },
    include: { storageSection: { include: { storageType: true } } },
  })
  if (!bin) throw new Error('no bin')

  const warehouseId = bin.storageSection.storageType.warehouseId
  const companyId = mat.companyId
  const materialId = mat.id
  const storageBinId = bin.id
  const uomId = mat.baseUomId
  const today = new Date().toISOString().slice(0, 10)
  const key = 'mm12-' + Date.now()

  // Ensure clean-ish stock for smoke material at this bin
  await p.mmInventoryBalance.deleteMany({
    where: { materialId, warehouseId, storageBinId },
  })

  // ── STANDARD_COST ──────────────────────────────────────────────
  await j('POST', '/mm/valuation/material-valuations', {
    companyId,
    materialId,
    warehouseId,
    valuationMethod: 'STANDARD_COST',
    standardCost: 10,
  })

  const stdIn = await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'RECEIPT',
    quantity: 10,
    uomId,
    unitCost: 12,
    postingDate: today,
    documentDate: today,
    sourceModule: 'MM12_SMOKE',
    idempotencyKey: key + '-std-in',
  })
  console.log('STANDARD receipt ledger cost', Number(stdIn.unitCost), Number(stdIn.totalCost))
  if (Number(stdIn.unitCost) !== 10) throw new Error('expected standard unit cost 10')

  const stdVal = await p.mmInventoryValuationTransaction.findUnique({
    where: { inventoryTxnId: stdIn.id },
  })
  if (!stdVal) throw new Error('missing valuation txn')
  if (Number(stdVal.priceVariance) !== 20) throw new Error('expected variance 20')
  const pvEvt = await p.mmAccountingEvent.findFirst({
    where: { documentId: stdVal.id, eventType: 'PRICE_VARIANCE_POSTED' },
  })
  if (!pvEvt) throw new Error('missing PRICE_VARIANCE_POSTED')
  console.log('STANDARD variance OK')

  // ── MOVING_AVERAGE ─────────────────────────────────────────────
  await j('POST', '/mm/valuation/material-valuations', {
    companyId,
    materialId,
    warehouseId,
    valuationMethod: 'MOVING_AVERAGE',
    standardCost: 10,
  })
  // reset MAP
  await p.mmMaterialValuation.updateMany({
    where: { companyId, materialId, warehouseId },
    data: { movingAverageCost: 0, valuationMethod: 'MOVING_AVERAGE' },
  })

  // Clear stock then receipt under MAP
  await p.mmInventoryBalance.deleteMany({
    where: { materialId, warehouseId, storageBinId },
  })

  const mapIn1 = await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'RECEIPT',
    quantity: 10,
    uomId,
    unitCost: 8,
    postingDate: today,
    documentDate: today,
    idempotencyKey: key + '-map-in1',
  })
  const mv = await p.mmMaterialValuation.findUnique({
    where: {
      companyId_materialId_warehouseId: { companyId, materialId, warehouseId },
    },
  })
  console.log('MAP after first receipt', Number(mv.movingAverageCost))
  if (Number(mv.movingAverageCost) !== 8) throw new Error('MAP should be 8')

  const mapOut = await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'ISSUE',
    quantity: 4,
    uomId,
    postingDate: today,
    documentDate: today,
    idempotencyKey: key + '-map-out',
  })
  console.log('MAP issue unit cost', Number(mapOut.unitCost))
  if (Number(mapOut.unitCost) !== 8) throw new Error('issue should use MAP 8')

  await reverseTxn(mapOut.id)
  const mvAfterRev = await p.mmMaterialValuation.findUnique({
    where: {
      companyId_materialId_warehouseId: { companyId, materialId, warehouseId },
    },
  })
  // Issue reversal restores MAP snapshot (same MAP) — still 8
  console.log('MAP after issue reverse', Number(mvAfterRev.movingAverageCost))

  // ── FIFO ───────────────────────────────────────────────────────
  await p.mmMaterialValuation.updateMany({
    where: { companyId, materialId, warehouseId },
    data: { valuationMethod: 'FIFO', movingAverageCost: 0 },
  })
  await p.mmInventoryBalance.deleteMany({
    where: { materialId, warehouseId, storageBinId },
  })
  await p.mmCostLayer.deleteMany({
    where: { materialId, warehouseId },
  })

  await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'RECEIPT',
    quantity: 5,
    uomId,
    unitCost: 4,
    postingDate: today,
    documentDate: today,
    idempotencyKey: key + '-fifo-in1',
  })
  await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'RECEIPT',
    quantity: 5,
    uomId,
    unitCost: 6,
    postingDate: today,
    documentDate: today,
    idempotencyKey: key + '-fifo-in2',
  })

  const layers = await p.mmCostLayer.findMany({
    where: { materialId, warehouseId, status: 'OPEN' },
    orderBy: { postingDate: 'asc' },
  })
  console.log(
    'FIFO layers',
    layers.map((l) => ({ rem: Number(l.remainingQuantity), cost: Number(l.unitCost) })),
  )
  if (layers.length < 2) throw new Error('expected 2 FIFO layers')

  const fifoOut = await postTxn({
    companyId,
    warehouseId,
    storageBinId,
    materialId,
    movementType: 'ISSUE',
    quantity: 7,
    uomId,
    postingDate: today,
    documentDate: today,
    idempotencyKey: key + '-fifo-out',
  })
  // 5*4 + 2*6 = 32 → unit ~4.571429
  console.log('FIFO issue total', Number(fifoOut.totalCost), 'unit', Number(fifoOut.unitCost))
  if (Number(fifoOut.totalCost) !== 32) throw new Error('expected FIFO total 32')

  const layersAfter = await p.mmCostLayer.findMany({
    where: { materialId, warehouseId },
    orderBy: { createdAt: 'asc' },
  })
  const rem = layersAfter.map((l) => Number(l.remainingQuantity))
  console.log('FIFO remaining after issue', rem)
  if (rem[0] !== 0 || rem[1] !== 3) throw new Error('unexpected layer remaining')

  await reverseTxn(fifoOut.id)
  const layersRestored = await p.mmCostLayer.findMany({
    where: { materialId, warehouseId },
    orderBy: { createdAt: 'asc' },
  })
  const rem2 = layersRestored.map((l) => Number(l.remainingQuantity))
  console.log('FIFO remaining after reverse', rem2)
  if (rem2[0] !== 5 || rem2[1] !== 5) throw new Error('layers not restored')

  const invValue = await j(
    'GET',
    `/mm/valuation/inventory-value?companyId=${companyId}&warehouseId=${warehouseId}&materialId=${materialId}`,
  )
  console.log('inventory-value rows', invValue.data?.length)

  console.log('SMOKE OK')
}

main()
  .catch((e) => {
    console.error('SMOKE FAIL', e.message)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
