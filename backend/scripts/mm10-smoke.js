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
  // Restore soft-deleted material for smoke
  const mat = await p.mmMaterial.update({
    where: { id: 'cmtl00vq80008kun4mnbv7gk6' },
    data: { deletedAt: null },
  })
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

  // Ensure bin-level stock
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
  } else if (Number(bal.availableQuantity) < 5) {
    bal = await p.mmInventoryBalance.update({
      where: { id: bal.id },
      data: {
        quantity: 50,
        reservedQuantity: 0,
        availableQuantity: 50,
      },
    })
  }

  console.log('prepared', { materialId, warehouseId, storageBinId, avail: bal.availableQuantity })

  const atp = await j(
    'GET',
    `/mm/available-stock?companyId=${companyId}&warehouseId=${warehouseId}&materialId=${materialId}`,
  )
  console.log('ATP', {
    available: atp.available,
    unrestricted: atp.unrestrictedStock,
    reserved: atp.existingReservations,
  })

  const rsv = await j('POST', '/mm/reservations', {
    companyId,
    warehouseId,
    materialId,
    quantity: 2,
    storageBinId,
    sourceType: 'PRODUCTION_ORDER',
    sourceModule: 'PP',
    sourceDocumentType: 'PO',
    sourceDocumentId: 'PP-SMOKE-' + Date.now(),
  })
  console.log('RSV', rsv.reservationNumber)

  let insuff = false
  try {
    await j('POST', '/mm/reservations', {
      companyId,
      warehouseId,
      materialId,
      quantity: 999999,
      sourceType: 'INTERNAL_REQUEST',
      sourceModule: 'MM',
      sourceDocumentType: 'IMR',
      sourceDocumentId: 'X',
    })
  } catch (e) {
    insuff = String(e.message).includes('400')
  }
  console.log('insufficient OK', insuff)

  const wave = await j('POST', '/mm/pick-waves', {
    warehouseId,
    strategy: 'FEFO',
    priority: 2,
    reservationIds: [rsv.id],
  })
  console.log('WAVE', wave.waveNumber, 'tasks', wave.tasks?.length)

  const pick = wave.tasks[0]
  await j('POST', `/mm/picking/${pick.id}/assign`, { userId: 'smoke' })

  const keyBase = 'mm10-' + Date.now()

  // partial pick 1 of 2
  const partial = await j('POST', `/mm/picking/${pick.id}/confirm`, {
    scannedBinId: pick.sourceBinId,
    scannedMaterialId: pick.materialId,
    pickedQty: 1,
    idempotencyKey: keyBase + '-partial-1',
  })
  console.log('partial', partial.status, partial.pickedQty)

  const done = await j('POST', `/mm/picking/${pick.id}/confirm`, {
    scannedBinId: pick.sourceBinId,
    scannedMaterialId: pick.materialId,
    pickedQty: 1,
    idempotencyKey: keyBase + '-partial-2',
  })
  console.log('complete', done.status, done.pickedQty)

  const idem = await j('POST', `/mm/picking/${pick.id}/confirm`, {
    scannedBinId: pick.sourceBinId,
    scannedMaterialId: pick.materialId,
    pickedQty: 1,
    idempotencyKey: keyBase + '-partial-2',
  })
  console.log('idempotent', idem.status, idem.pickedQty)

  const pkg = await j('POST', `/mm/packages/from-picking/${pick.id}`)
  await j('POST', `/mm/packages/${pkg.id}/scan`, {
    materialId,
    quantity: 2,
  })
  const ver = await j('POST', `/mm/packages/${pkg.id}/verify`)
  console.log('verify', ver.status)
  const ready = await j('POST', `/mm/packages/${pkg.id}/ready-for-dispatch`)
  console.log('ready', ready.status)

  const today = new Date().toISOString().slice(0, 10)
  const gi = await j('POST', '/mm/goods-issues', {
    companyId,
    warehouseId,
    reservationId: rsv.id,
    packageId: pkg.id,
    postingDate: today,
    documentDate: today,
    issuePurpose: 'PRODUCTION',
    lines: [
      {
        materialId,
        quantity: 2,
        uomId,
        storageBinId: pick.sourceBinId,
        reservationId: rsv.id,
        pickingTaskId: pick.id,
        unitCost: 7.5,
      },
    ],
  })
  console.log('GI', gi.documentNumber)
  const posted = await j('POST', `/mm/goods-issues/${gi.id}/post`)
  console.log('posted', posted.status)

  const acct = await p.mmAccountingEvent.findFirst({
    where: { documentId: gi.id, eventType: 'GOODS_ISSUE_POSTED' },
  })
  console.log('accounting event', !!acct, acct?.eventType)

  const rev = await j('POST', `/mm/goods-issues/${gi.id}/reverse`, {})
  console.log('reversed', rev.status)
  console.log('SMOKE OK')
}

main()
  .catch((e) => {
    console.error('SMOKE FAIL', e.message)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
