/**
 * MM-16 smoke: supplier return + disposal full lifecycle with accounting events
 * Requires Nest API on http://localhost:3001 and seeded data (company, warehouse, material, supplier, uom)
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
    try { d = JSON.parse(t) } catch { d = t }
    if (!r.ok) throw new Error(`${m} ${path} ${r.status} ${t.slice(0, 600)}`)
    return d
}

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg) }

async function main() {
    // Find seed data
    const company = await p.company.findFirst()
    if (!company) throw new Error('Need at least one company')
    const warehouse = await p.warehouse.findFirst({ where: { companyId: company.id } })
    if (!warehouse) throw new Error('Need at least one warehouse')
    let material = await p.mmMaterial.findFirst({
        where: { status: 'ACTIVE', inventoryManaged: true, deletedAt: null },
    })
    if (!material) {
        // Try to restore a soft-deleted material for the smoke test
        const softDeleted = await p.mmMaterial.findFirst({
            where: { status: 'ACTIVE', inventoryManaged: true },
        })
        if (softDeleted) {
            material = await p.mmMaterial.update({
                where: { id: softDeleted.id },
                data: { deletedAt: null },
            })
            console.log('restored soft-deleted material', material.materialCode)
        }
    }
    if (!material) throw new Error('Need at least one active, inventory-managed material')
    const supplier = await p.mmSupplier.findFirst({ where: { companyId: company.id } })
    if (!supplier) throw new Error('Need at least one supplier')
    let uom = await p.mmUom.findFirst({ where: { isActive: true, deletedAt: null } })
    if (!uom) {
        // Restore a soft-deleted UOM
        const softUom = await p.mmUom.findFirst()
        if (softUom) {
            uom = await p.mmUom.update({ where: { id: softUom.id }, data: { deletedAt: null, isActive: true } })
            console.log('restored UOM', uom.code)
        }
    }
    if (!uom) throw new Error('Need at least one UOM')

    console.log('Using company', company.code, 'warehouse', warehouse.code, 'material', material.materialCode)

    // Seed blocked stock for the material so posting can decrement
    const existingBal = await p.mmInventoryBalance.findFirst({
        where: { companyId: company.id, warehouseId: warehouse.id, materialId: material.id, stockStatus: 'BLOCKED' },
    })
    if (existingBal) {
        await p.mmInventoryBalance.update({
            where: { id: existingBal.id },
            data: { quantity: 1000, availableQuantity: 1000 },
        })
    } else {
        await p.mmInventoryBalance.create({
            data: {
                companyId: company.id,
                warehouseId: warehouse.id,
                materialId: material.id,
                stockStatus: 'BLOCKED',
                quantity: 1000,
                availableQuantity: 1000,
            },
        })
    }

    // ── Config: set low threshold so return needs approval ──
    await j('PATCH', '/mm/returns-disposal/config', {
        companyId: company.id,
        approvalAmountThreshold: 100,
        approvalQuantityThreshold: 0,
    })
    console.log('config set: amount threshold = 100')

    // ── Supplier Return lifecycle ──
    const ret = await j('POST', '/mm/returns-disposal/supplier-returns', {
        companyId: company.id,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        reason: 'QUALITY_FAILURE',
        remarks: 'Smoke test return',
        lines: [{
            materialId: material.id,
            uomId: uom.id,
            quantity: 5,
            unitCost: 50,
            reason: 'QUALITY_FAILURE',
            stockStatus: 'BLOCKED',
        }],
    })
    console.log('return created', ret.returnNumber, 'status', ret.status)
    assert(ret.status === 'DRAFT', 'should be DRAFT')

    // Submit → should need approval (5×50=250 > 100)
    const submitted = await j('POST', `/mm/returns-disposal/supplier-returns/${ret.id}/submit`, {})
    console.log('submitted → status', submitted.status)
    assert(submitted.status === 'PENDING_APPROVAL', 'should be PENDING_APPROVAL')

    // Approve
    const approved = await j('POST', `/mm/returns-disposal/supplier-returns/${ret.id}/approve`, { performedBy: 'smoke-tester' })
    console.log('approved → status', approved.status)
    assert(approved.status === 'APPROVED', 'should be APPROVED')

    // Ship → posts RETURN_OUT inventory transaction
    const shipped = await j('POST', `/mm/returns-disposal/supplier-returns/${ret.id}/ship`, { performedBy: 'smoke-tester' })
    console.log('shipped → status', shipped.status)
    assert(shipped.status === 'SHIPPED', 'should be SHIPPED')

    // Verify inventory transaction
    const retTxns = await p.mmInventoryTransaction.findMany({
        where: { sourceDocumentId: ret.id, sourceDocumentType: 'SUPPLIER_RETURN' },
    })
    assert(retTxns.length > 0, 'should have inventory transaction for return')
    assert(retTxns[0].movementType === 'RETURN_OUT', 'movement type should be RETURN_OUT')
    console.log('inventory txn', retTxns[0].transactionNumber, retTxns[0].movementType)

    // Verify accounting event
    const retAcctEvent = await p.mmAccountingEvent.findFirst({
        where: { documentId: ret.id, eventType: 'SUPPLIER_RETURN_POSTED' },
    })
    assert(retAcctEvent, 'should have SUPPLIER_RETURN_POSTED accounting event')
    console.log('accounting event', retAcctEvent.eventType, retAcctEvent.status)

    // Reverse the return
    const reversed = await j('POST', `/mm/returns-disposal/supplier-returns/${ret.id}/reverse`, { performedBy: 'smoke-tester' })
    console.log('reversed → status', reversed.status)
    assert(reversed.status === 'REVERSED', 'should be REVERSED')

    const revEvent = await p.mmAccountingEvent.findFirst({
        where: { documentId: ret.id, eventType: 'SUPPLIER_RETURN_REVERSED' },
    })
    assert(revEvent, 'should have SUPPLIER_RETURN_REVERSED accounting event')
    console.log('reversal event', revEvent.eventType)

    // ── Disposal / Scrap lifecycle ──

    // Re-seed blocked stock (reversal restored it, but ensure enough)
    const bal2 = await p.mmInventoryBalance.findFirst({
        where: { companyId: company.id, warehouseId: warehouse.id, materialId: material.id, stockStatus: 'BLOCKED' },
    })
    if (bal2) {
        await p.mmInventoryBalance.update({ where: { id: bal2.id }, data: { quantity: 1000, availableQuantity: 1000 } })
    }

    // Set high threshold so disposal auto-approves
    await j('PATCH', '/mm/returns-disposal/config', {
        companyId: company.id,
        approvalAmountThreshold: 999999,
        approvalQuantityThreshold: 0,
    })

    const dsp = await j('POST', '/mm/returns-disposal/disposals', {
        companyId: company.id,
        warehouseId: warehouse.id,
        disposalType: 'SCRAP',
        reason: 'DAMAGE',
        remarks: 'Smoke test scrap',
        lines: [{
            materialId: material.id,
            uomId: uom.id,
            quantity: 3,
            unitCost: 20,
            reason: 'DAMAGE',
            stockStatus: 'BLOCKED',
        }],
    })
    console.log('disposal created', dsp.disposalNumber, 'status', dsp.status)
    assert(dsp.status === 'DRAFT', 'should be DRAFT')

    // Submit → auto-approves (3×20=60 < 999999)
    const dspSubmitted = await j('POST', `/mm/returns-disposal/disposals/${dsp.id}/submit`, {})
    console.log('disposal submitted → status', dspSubmitted.status)
    assert(dspSubmitted.status === 'APPROVED', 'should auto-approve to APPROVED')

    // Post → SCRAP inventory transaction
    const posted = await j('POST', `/mm/returns-disposal/disposals/${dsp.id}/post`, { performedBy: 'smoke-tester' })
    console.log('disposal posted → status', posted.status)
    assert(posted.status === 'POSTED', 'should be POSTED')

    // Verify SCRAP txn + accounting event
    const dspTxns = await p.mmInventoryTransaction.findMany({
        where: { sourceDocumentId: dsp.id, sourceDocumentType: 'DISPOSAL' },
    })
    assert(dspTxns.length > 0, 'should have SCRAP transaction')
    assert(dspTxns[0].movementType === 'SCRAP', 'movement type should be SCRAP')
    console.log('scrap txn', dspTxns[0].transactionNumber)

    const dspAcct = await p.mmAccountingEvent.findFirst({
        where: { documentId: dsp.id, eventType: 'DISPOSAL_POSTED' },
    })
    assert(dspAcct, 'should have DISPOSAL_POSTED accounting event')
    console.log('disposal accounting event', dspAcct.eventType)

    // Reverse disposal
    const dspReversed = await j('POST', `/mm/returns-disposal/disposals/${dsp.id}/reverse`, { performedBy: 'smoke-tester' })
    console.log('disposal reversed → status', dspReversed.status)
    assert(dspReversed.status === 'REVERSED', 'should be REVERSED')

    const dspRevEvent = await p.mmAccountingEvent.findFirst({
        where: { documentId: dsp.id, eventType: 'DISPOSAL_REVERSED' },
    })
    assert(dspRevEvent, 'should have DISPOSAL_REVERSED accounting event')
    console.log('disposal reversal event', dspRevEvent.eventType)

    // ── Damaged/expired stock worklists ──
    const damaged = await j('GET', `/mm/returns-disposal/damaged-stock?companyId=${company.id}`)
    console.log('damaged stock items', damaged.total ?? damaged.data?.length ?? 0)

    const expired = await j('GET', `/mm/returns-disposal/expired-stock?companyId=${company.id}`)
    console.log('expired stock items', expired.total ?? expired.data?.length ?? 0)

    // Restore default threshold
    await j('PATCH', '/mm/returns-disposal/config', {
        companyId: company.id,
        approvalAmountThreshold: 10000,
        approvalQuantityThreshold: 0,
    })

    console.log('MM-16 smoke OK')
}

main()
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => p.$disconnect())
