/**
 * MM-18 smoke: dashboard KPIs/alerts + analytics cache
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

function assert(cond, msg) {
    if (!cond) throw new Error('ASSERT: ' + msg)
}

async function main() {
    const company = await p.company.findFirst()
    if (!company) throw new Error('Need a company')

    const qs = `companyId=${encodeURIComponent(company.id)}`

    const dash = await j('GET', `/mm/dashboard?${qs}`)
    console.log('dashboard visibility', dash.visibility)
    assert(dash.kpis, 'kpis present')
    assert(Array.isArray(dash.kpis.inventory), 'inventory kpis')
    assert(Array.isArray(dash.kpis.procurement), 'procurement kpis')
    assert(Array.isArray(dash.kpis.warehouse), 'warehouse kpis')
    assert(Array.isArray(dash.alerts), 'alerts array')
    assert(dash.analytics, 'analytics summaries')
    console.log(
        'kpi counts',
        dash.kpis.inventory.length,
        dash.kpis.procurement.length,
        dash.kpis.warehouse.length,
        'alerts',
        dash.alerts.length,
    )

    const aging1 = await j('GET', `/mm/dashboard/analytics/aging?${qs}`)
    console.log('aging1 cached=', aging1.cached, 'buckets', aging1.buckets?.length ?? 0)
    assert(aging1.buckets || aging1.cached !== undefined, 'aging payload')

    const aging2 = await j('GET', `/mm/dashboard/analytics/aging?${qs}`)
    console.log('aging2 cached=', aging2.cached)
    assert(aging2.cached === true, 'second aging call should hit cache')

    const refreshed = await j('POST', '/mm/dashboard/refresh', { companyId: company.id })
    assert(refreshed.aging, 'refresh returns aging')
    console.log('refresh ok, aging buckets', refreshed.aging?.buckets?.length ?? 0)

    const aging3 = await j('GET', `/mm/dashboard/analytics/aging?${qs}`)
    console.log('aging3 after refresh cached=', aging3.cached)
    // After refresh, first recompute writes cache with cached:false; may already be cached if refresh filled it
    assert(aging3.buckets, 'aging still has buckets after refresh')

    console.log('MM-18 smoke OK')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())
