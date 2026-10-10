/**
 * End-to-end API test for the customer-return integration chain.
 *
 *   SCM damage report → SD sales return → MM customer return intake
 *
 * Run AFTER the presentation seed (fresh chain):
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-customer-return-demo.ts
 *   node scripts/test-customer-return-api.mjs
 *
 * Env overrides: API_BASE, DEMO_USER_ID, DEMO_SHIP_REF
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3011/api/v1'
const USER_ID = process.env.DEMO_USER_ID ?? 'cmtij6yn60000m1kwsu0iujpr'
const SHIP_REF = process.env.DEMO_SHIP_REF ?? 'SHP-CR-DEMO-001'

let pass = 0
let fail = 0
const log = (...a) => console.log(...a)
const ok = (name, cond, detail = '') => {
    if (cond) {
        pass++
        log(`  \x1b[32mPASS\x1b[0m ${name}`)
    } else {
        fail++
        log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`)
    }
    return cond
}

async function api(method, path, { body, user = USER_ID } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (user) headers['X-User-Id'] = user
    const hasBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method)
    const payload = body === undefined && hasBodyMethod ? {} : body
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
    })
    const text = await res.text()
    let data = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        data = text
    }
    return { status: res.status, data }
}

const section = (t) => log(`\n\x1b[36m${t}\x1b[0m`)

async function main() {
    log(`Customer-return E2E — ${BASE}`)

    // ── Resolve seeded shipment ────────────────────────────────────────────
    section('0. Resolve seeded delivery')
    const list = await api('GET', `/scm/shipments?search=${SHIP_REF}&pageSize=5`)
    const shipment = (list.data?.data ?? []).find((s) => s.reference === SHIP_REF)
    ok('seeded shipment found', Boolean(shipment), `status ${list.status}`)
    if (!shipment) return finish()
    const detail = await api('GET', `/scm/shipments/${shipment.id}`)
    const ship = detail.data
    const line = ship?.lines?.[0]
    ok('shipment is DELIVERED', ship?.status === 'DELIVERED', `status=${ship?.status}`)
    ok('shipment has a cargo line', Boolean(line))

    const wh = await api('GET', `/mm/warehouses?limit=100`)
    const warehouse = (wh.data?.data ?? wh.data ?? []).find((w) => w.code === 'MAIN')
    ok('MAIN warehouse resolved', Boolean(warehouse))

    // ── 1. SCM damage report ───────────────────────────────────────────────
    section('1. SCM — report delivery damage')
    const idem = `E2E-${Date.now()}`
    const reportBody = {
        shipmentLineId: line.id,
        damagedQuantity: 3,
        description: 'Carton crushed in transit — 3 rods bent',
        photoUrls: ['https://demo.agctek.local/damage/1.jpg'],
        idempotencyKey: idem,
    }
    const created = await api('POST', `/scm/shipments/${ship.id}/damage-reports`, { body: reportBody })
    const report = created.data
    ok('damage report created', created.status === 201, `status ${created.status} ${JSON.stringify(created.data)?.slice(0, 160)}`)
    ok('report resolved the original sales order', report?.salesOrderStatus === 'RESOLVED' && Boolean(report?.salesOrderId), `salesOrderStatus=${report?.salesOrderStatus}`)
    ok('report is line-level', report?.shipmentLineId === line.id)

    const again = await api('POST', `/scm/shipments/${ship.id}/damage-reports`, { body: reportBody })
    ok('duplicate report is idempotent (same id)', again.data?.id === report?.id, `id ${again.data?.id}`)

    const reportsList = await api('GET', `/scm/shipments/${ship.id}/damage-reports`)
    ok('report retrievable in list', (reportsList.data?.data ?? []).some((r) => r.id === report.id))

    // ── 2. SCM → SD handoff ────────────────────────────────────────────────
    section('2. SCM → SD — initiate sales return')
    const handoff = await api('POST', `/scm/shipments/${ship.id}/damage-reports/${report.id}/initiate-return`)
    const salesReturn = handoff.data?.salesReturn
    ok('sales return created', handoff.status === 200 && handoff.data?.created === true, `status ${handoff.status}`)
    ok('return starts REQUESTED', salesReturn?.status === 'REQUESTED', `status=${salesReturn?.status}`)

    const handoff2 = await api('POST', `/scm/shipments/${ship.id}/damage-reports/${report.id}/initiate-return`)
    ok('repeat handoff is rejected (no duplicate)', handoff2.status === 409, `status ${handoff2.status}`)

    const srList = await api('GET', `/sd/sales-returns?salesOrderId=${report.salesOrderId}`)
    const srCount = (srList.data?.data ?? []).filter((r) => r.damageReportId === report.id).length
    ok('exactly one return for the report', srCount === 1, `count=${srCount}`)

    // ── 3. SD authorize ────────────────────────────────────────────────────
    section('3. SD — authorize the sales return')
    const auth = await api('POST', `/sd/sales-returns/${salesReturn.id}/authorize`)
    ok('return AUTHORIZED', auth.data?.status === 'AUTHORIZED', `status=${auth.data?.status}`)
    const auth2 = await api('POST', `/sd/sales-returns/${salesReturn.id}/authorize`)
    ok('double authorize rejected', auth2.status === 409, `status ${auth2.status}`)

    // ── 4. SD → MM intake ──────────────────────────────────────────────────
    section('4. SD → MM — open customer return intake')
    const intake = await api('POST', `/sd/sales-returns/${salesReturn.id}/initiate-intake`, {
        body: { warehouseId: warehouse.id },
    })
    const cr = intake.data?.customerReturn
    ok('MM intake created', intake.status === 200 && intake.data?.created === true, `status ${intake.status}`)
    ok('intake is DRAFT', cr?.status === 'DRAFT', `status=${cr?.status}`)

    const intake2 = await api('POST', `/sd/sales-returns/${salesReturn.id}/initiate-intake`, {
        body: { warehouseId: warehouse.id },
    })
    ok('repeat intake is idempotent (created:false, same return)', intake2.data?.created === false && intake2.data?.customerReturn?.id === cr?.id)

    // ── 5. Traceability ────────────────────────────────────────────────────
    section('5. Traceability across modules')
    const srDetail = await api('GET', `/sd/sales-returns/${salesReturn.id}`)
    ok('SD return → damage report reference', srDetail.data?.damageReport?.reference === report.reference, `ref=${srDetail.data?.damageReport?.reference}`)
    ok('SD return → MM intake reference', srDetail.data?.customerReturn?.returnNumber === cr.returnNumber, `ref=${srDetail.data?.customerReturn?.returnNumber}`)

    const crDetail = await api('GET', `/mm/returns/customer/${cr.id}`)
    ok('MM intake → SD return reference', crDetail.data?.sdSalesReturn?.returnNumber === salesReturn.returnNumber, `ref=${crDetail.data?.sdSalesReturn?.returnNumber}`)
    ok('MM intake → SCM damage report reference', crDetail.data?.damageReport?.reference === report.reference, `ref=${crDetail.data?.damageReport?.reference}`)

    const reportDetail = await api('GET', `/scm/shipments/${ship.id}/damage-reports/${report.id}`)
    ok('SCM report → SD return reference', reportDetail.data?.sdSalesReturnId === salesReturn.id)

    // ── 6. MM lifecycle (intake → inspection → disposition, NO posting) ─────
    section('6. MM lifecycle (stops before inventory posting)')
    const started = await api('POST', `/mm/returns/customer/${cr.id}/intake`)
    ok('intake started', started.data?.status === 'INTAKE', `status=${started.data?.status}`)
    const inspected = await api('POST', `/mm/returns/customer/${cr.id}/inspect`, {
        body: { result: 'PASS', lotNotes: 'Visual inspection — restockable', performedBy: USER_ID },
    })
    ok('inspection recorded', ['INSPECTION', 'INTAKE'].includes(inspected.data?.status), `status=${inspected.data?.status}`)
    const crLine = (inspected.data?.lines ?? [])[0]
    const disp = await api('POST', `/mm/returns/customer/lines/${crLine.id}/disposition`, {
        body: { disposition: 'RESTOCK', performedBy: USER_ID },
    })
    ok('disposition set (no inventory posted)', disp.data?.disposition === 'RESTOCK', `disposition=${disp.data?.disposition}`)

    // ── 7. Negatives ───────────────────────────────────────────────────────
    section('7. Negatives / guardrails')
    const noAuth = await api('GET', `/scm/shipments/${ship.id}`, { user: null })
    ok('missing auth header → 401', noAuth.status === 401, `status ${noAuth.status}`)

    const badReport = await api('POST', `/scm/shipments/does-not-exist/damage-reports`, {
        body: { damagedQuantity: 1, description: 'x' },
    })
    ok('unknown shipment → 404', badReport.status === 404, `status ${badReport.status}`)

    const draft = await api('POST', `/scm/shipments`, {
        body: { reference: `SHP-E2E-DRAFT-${Date.now()}`, destAddress: 'Test', quantity: 1, status: 'DRAFT' },
    })
    if (draft.data?.id) {
        const onDraft = await api('POST', `/scm/shipments/${draft.data.id}/damage-reports`, {
            body: { damagedQuantity: 1, description: 'x' },
        })
        ok('damage on non-delivered shipment → 409', onDraft.status === 409, `status ${onDraft.status}`)
        await api('DELETE', `/scm/shipments/${draft.data.id}`)
    } else {
        ok('draft shipment created for negative test', false, `status ${draft.status}`)
    }

    const badLine = await api('POST', `/scm/shipments/${ship.id}/damage-reports`, {
        body: { shipmentLineId: 'nope', damagedQuantity: 1, description: 'x' },
    })
    ok('damage report with foreign line → 400', badLine.status === 400, `status ${badLine.status}`)

    finish()
}

function finish() {
    log(`\n\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m`)
    process.exitCode = fail === 0 ? 0 : 1
}

main().catch((e) => {
    console.error('\n\x1b[31mUnexpected error:\x1b[0m', e)
    process.exitCode = 1
})
