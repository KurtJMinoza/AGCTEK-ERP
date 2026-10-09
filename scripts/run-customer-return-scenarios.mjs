/**
 * Drives the three seeded customer-return scenarios through the real HTTP API to distinct
 * terminal states. Run AFTER the presentation seed.
 *
 *   cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-customer-return-demo.ts
 *   node scripts/run-customer-return-scenarios.mjs
 *
 *   001 → damage report → SD return → authorize → MM intake → inspect → RESTOCK   (INSPECTION)
 *   002 → damage report → SD return → authorize → MM intake → inspect → SCRAP      (APPROVED)
 *   003 → damage report → SD return → reject                                       (REJECTED, no intake)
 *
 * Env: API_BASE, DEMO_USER_ID
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3011/api/v1'
const USER_ID = process.env.DEMO_USER_ID ?? 'cmtij6yn60000m1kwsu0iujpr'

const SCENARIOS = [
    {
        ref: 'SHP-CR-DEMO-001',
        damageQty: 3,
        description: 'Carton crushed in transit — 3 steel rods bent',
        intent: 'restock_inspection',
    },
    {
        ref: 'SHP-CR-DEMO-002',
        damageQty: 2,
        description: 'Oil drums ruptured on the tailgate — 2 units leaked',
        intent: 'scrap_approved',
    },
    {
        ref: 'SHP-CR-DEMO-003',
        damageQty: 5,
        description: 'Boxes water-damaged by rain at the delivery stop',
        intent: 'reject',
    },
]

async function api(method, path, body, user = USER_ID) {
    const headers = { 'Content-Type': 'application/json' }
    if (user) headers['X-User-Id'] = user
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method)
    const payload = body === undefined && hasBody ? {} : body
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
    if (!res.ok) {
        throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`)
    }
    return data
}

async function resolveShipment(ref) {
    const list = await api('GET', `/scm/shipments?search=${ref}&pageSize=5`)
    const found = (list.data ?? []).find((s) => s.reference === ref)
    if (!found) throw new Error(`shipment ${ref} not found — run the seed first`)
    const detail = await api('GET', `/scm/shipments/${found.id}`)
    return { shipment: detail, line: detail.lines[0] }
}

async function runScenario(sc, warehouseId, summary) {
    const { shipment, line } = await resolveShipment(sc.ref)
    const idem = `SCN-${sc.ref}-${Date.now()}`

    const report = await api('POST', `/scm/shipments/${shipment.id}/damage-reports`, {
        shipmentLineId: line.id,
        damagedQuantity: sc.damageQty,
        description: sc.description,
        idempotencyKey: idem,
    })

    const handoff = await api('POST', `/scm/shipments/${shipment.id}/damage-reports/${report.id}/initiate-return`)
    const sr = handoff.salesReturn

    const row = {
        shipment: shipment.reference,
        damageReport: report.reference,
        salesReturn: sr.returnNumber,
        mmIntake: '—',
        finalState: '',
    }

    if (sc.intent === 'reject') {
        await api('POST', `/sd/sales-returns/${sr.id}/reject`, { reason: 'Damage claim not substantiated by POD' })
        row.finalState = 'SD return REJECTED (no MM intake)'
        summary.push(row)
        return
    }

    await api('POST', `/sd/sales-returns/${sr.id}/authorize`)
    const intake = await api('POST', `/sd/sales-returns/${sr.id}/initiate-intake`, { warehouseId })
    const cr = intake.customerReturn
    row.mmIntake = cr.returnNumber

    await api('POST', `/mm/returns/customer/${cr.id}/intake`)
    const inspected = await api('POST', `/mm/returns/customer/${cr.id}/inspect`, {
        result: 'FAIL',
        lotNotes: `Scenario ${sc.ref}: damage confirmed`,
        performedBy: USER_ID,
    })
    const crLine = inspected.lines[0]
    const disposition = sc.intent === 'scrap_approved' ? 'SCRAP' : 'RESTOCK'
    await api('POST', `/mm/returns/customer/lines/${crLine.id}/disposition`, {
        disposition,
        performedBy: USER_ID,
    })

    if (sc.intent === 'scrap_approved') {
        let after = await api('POST', `/mm/returns/customer/${cr.id}/submit`, { performedBy: USER_ID })
        if (after.status === 'PENDING_APPROVAL') {
            after = await api('POST', `/mm/returns/customer/${cr.id}/approve`, { performedBy: USER_ID })
        }
        row.finalState = `MM intake ${after.status} (disposition ${disposition})`
    } else {
        const detail = await api('GET', `/mm/returns/customer/${cr.id}`)
        row.finalState = `MM intake ${detail.status} (disposition ${disposition})`
    }
    summary.push(row)
}

async function main() {
    console.log(`Customer-return scenarios — ${BASE}\n`)
    const wh = await api('GET', `/mm/warehouses?limit=100`)
    const warehouse = (wh.data ?? wh ?? []).find((w) => w.code === 'MAIN')
    if (!warehouse) throw new Error('MAIN warehouse not found')
    console.log(`warehouse ${warehouse.code} (${warehouse.id})\n`)

    const summary = []
    for (const sc of SCENARIOS) {
        await runScenario(sc, warehouse.id, summary)
        const last = summary[summary.length - 1]
        console.log(
            `${last.shipment}  ${last.damageReport}  ${last.salesReturn}  ${last.mmIntake}\n    → ${last.finalState}`,
        )
    }

    console.log('\n=== Summary ===')
    console.table(summary)
    console.log('\n✅ Scenarios populated.')
}

main().catch((e) => {
    console.error('\n\x1b[31mScenario driver failed:\x1b[0m', e.message ?? e)
    process.exit(1)
})
