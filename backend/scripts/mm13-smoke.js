/**
 * MM-13 smoke: invoice vs posted PO+GR → match success / qty block
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
    where: { status: 'POSTED', purchaseOrderId: { not: null } },
    include: {
      lines: true,
      purchaseOrder: { include: { lines: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (!gr || !gr.purchaseOrder) throw new Error('Need a POSTED GR linked to a PO')

  const po = gr.purchaseOrder
  const poLine =
    po.lines.find((l) =>
      gr.lines.some((gl) => gl.purchaseOrderLineId === l.id),
    ) || po.lines[0]
  const grLine =
    gr.lines.find((l) => l.purchaseOrderLineId === poLine.id) || gr.lines[0]
  if (!poLine || !grLine) throw new Error('Missing PO/GR lines')

  const received = Number(poLine.receivedQuantity || grLine.quantity)
  if (received <= 0) throw new Error('PO line has no received qty')

  // Reset invoiced for smoke
  await p.mmPurchaseOrderLine.update({
    where: { id: poLine.id },
    data: { invoicedQuantity: 0 },
  })

  await j('PATCH', '/mm/three-way-match/tolerance-config', {
    companyId: po.companyId,
    quantityTolerancePct: 0,
    priceTolerancePct: 0,
    absoluteToleranceAmount: 0,
  })

  const today = new Date().toISOString().slice(0, 10)

  // Success path: invoice qty = received
  const ok = await j('POST', '/mm/three-way-match/invoices', {
    companyId: po.companyId,
    supplierId: po.supplierId,
    purchaseOrderId: po.id,
    currencyId: po.currencyId || undefined,
    invoiceDate: today,
    taxAmount: Number(poLine.tax) * (received / Number(poLine.quantity)),
    lines: [
      {
        materialId: poLine.materialId,
        purchaseOrderLineId: poLine.id,
        uomId: poLine.uomId,
        invoicedQuantity: received,
        unitPrice: Number(poLine.unitPrice),
        taxAmount: Number(poLine.tax) * (received / Number(poLine.quantity)),
        receipts: [
          {
            goodsReceiptLineId: grLine.id,
            allocatedQuantity: received,
          },
        ],
      },
    ],
  })
  console.log('invoice', ok.invoiceNumber, ok.status)
  await j('POST', `/mm/three-way-match/invoices/${ok.id}/submit`, {})
  const matched = await j(
    'POST',
    `/mm/three-way-match/invoices/${ok.id}/run-match`,
    {},
  )
  console.log('match result', matched.status, 'eligible', matched.paymentEligible)
  if (matched.status !== 'MATCHED' && matched.status !== 'PARTIALLY_MATCHED') {
    throw new Error(`expected MATCHED/PARTIALLY, got ${matched.status}`)
  }
  if (!matched.paymentEligible) throw new Error('expected paymentEligible')

  const evt = await p.mmAccountingEvent.findFirst({
    where: {
      documentId: ok.id,
      eventType: 'SUPPLIER_INVOICE_MATCHED',
    },
  })
  if (!evt) throw new Error('missing SUPPLIER_INVOICE_MATCHED event')
  console.log('accounting event OK')

  const pol = await p.mmPurchaseOrderLine.findUnique({ where: { id: poLine.id } })
  console.log('invoicedQuantity', Number(pol.invoicedQuantity))

  // Block path: invoice > GR
  await p.mmPurchaseOrderLine.update({
    where: { id: poLine.id },
    data: { invoicedQuantity: 0 },
  })
  const overQty = received + 2
  const bad = await j('POST', '/mm/three-way-match/invoices', {
    companyId: po.companyId,
    supplierId: po.supplierId,
    purchaseOrderId: po.id,
    currencyId: po.currencyId || undefined,
    invoiceDate: today,
    lines: [
      {
        materialId: poLine.materialId,
        purchaseOrderLineId: poLine.id,
        uomId: poLine.uomId,
        invoicedQuantity: overQty,
        unitPrice: Number(poLine.unitPrice),
        taxAmount: 0,
        receipts: [
          {
            goodsReceiptLineId: grLine.id,
            allocatedQuantity: received,
          },
        ],
      },
    ],
  })
  await j('POST', `/mm/three-way-match/invoices/${bad.id}/submit`, {})
  const blocked = await j(
    'POST',
    `/mm/three-way-match/invoices/${bad.id}/run-match`,
    {},
  )
  console.log('over-invoice', blocked.status)
  if (blocked.status !== 'BLOCKED') {
    throw new Error(`expected BLOCKED, got ${blocked.status}`)
  }
  const ex = await p.mmMatchException.findFirst({
    where: { invoiceId: bad.id, varianceType: 'QUANTITY' },
  })
  if (!ex) throw new Error('missing QUANTITY exception')
  console.log('exception', ex.varianceType, ex.severity)

  console.log('SMOKE OK')
}

main()
  .catch((e) => {
    console.error('SMOKE FAIL', e.message)
    process.exit(1)
  })
  .finally(() => p.$disconnect())
