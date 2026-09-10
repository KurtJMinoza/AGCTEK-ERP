/**
 * MM-17 smoke: resolve barcode → scanner event idempotency
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
    let user = await p.user.findFirst()
    if (!user) {
        const bcrypt = require('bcryptjs')
        user = await p.user.create({
            data: {
                email: 'scanner-smoke@test.local',
                userName: 'scanner_smoke',
                passwordHash: await bcrypt.hash('Test1234!', 8),
                role: 'admin',
            },
        })
        console.log('created smoke user', user.id)
    }

    let material = await p.mmMaterial.findFirst({
        where: { status: 'ACTIVE', inventoryManaged: true, deletedAt: null },
    })
    if (!material) {
        const soft = await p.mmMaterial.findFirst({
            where: { inventoryManaged: true },
        })
        if (soft) {
            material = await p.mmMaterial.update({
                where: { id: soft.id },
                data: { deletedAt: null, status: 'ACTIVE' },
            })
        }
    }
    if (!material) throw new Error('Need a material')

    let uom = await p.mmUom.findFirst({ where: { deletedAt: null } })
    if (!uom) {
        const softU = await p.mmUom.findFirst()
        if (softU) {
            uom = await p.mmUom.update({
                where: { id: softU.id },
                data: { deletedAt: null, isActive: true },
            })
        }
    }
    if (!uom) throw new Error('Need UOM')

    const bcValue = `SMOKE-BC-${Date.now()}`
    await p.mmBarcode.create({
        data: {
            materialId: material.id,
            barcodeType: 'EAN',
            barcodeValue: bcValue,
            isPrimary: false,
        },
    })
    console.log('created barcode', bcValue)

    // Resolve
    const hit = await j('GET', `/mm/scanner/resolve?barcode=${encodeURIComponent(bcValue)}`)
    console.log('resolve', hit.type, hit.materialId)
    assert(hit.type === 'MATERIAL_BARCODE', 'should resolve material barcode')
    assert(hit.materialId === material.id, 'material id match')

    // Find open count line or create a minimal count session for COUNTING smoke
    let countLine = await p.mmInventoryCountLine.findFirst({
        where: {
            count: { status: { in: ['OPEN', 'COUNTING', 'IN_PROGRESS'] } },
        },
        include: { count: true },
    })

    if (!countLine) {
        const company = await p.company.findFirst()
        const warehouse = await p.warehouse.findFirst({
            where: { companyId: company.id },
        })
        if (!company || !warehouse) throw new Error('Need company/warehouse')
        const count = await p.mmInventoryCount.create({
            data: {
                countNumber: `CNT-SMOKE-${Date.now()}`,
                companyId: company.id,
                warehouseId: warehouse.id,
                countType: 'CYCLE',
                status: 'COUNTING',
                createdBy: user.id,
                lines: {
                    create: [
                        {
                            lineNumber: 1,
                            materialId: material.id,
                            systemQuantity: 0,
                        },
                    ],
                },
            },
            include: { lines: true },
        })
        countLine = count.lines[0]
        console.log('created count', count.countNumber)
    }

    const idem = `mm17-smoke-${Date.now()}`
    const payload = {
        device_id: 'smoke-device',
        user_id: user.id,
        operation: 'COUNTING',
        barcode: bcValue,
        timestamp: new Date().toISOString(),
        quantity: 7,
        idempotency_key: idem,
        countLineId: countLine.id,
    }

    const first = await j('POST', '/mm/scanner/events', payload)
    console.log('first event', first.status, first.duplicate)
    assert(first.status === 'SUCCESS', 'first should SUCCESS')
    assert(!first.duplicate, 'first not duplicate')

    const second = await j('POST', '/mm/scanner/events', payload)
    console.log('second event', second.status, second.duplicate)
    assert(second.status === 'DUPLICATE' || second.duplicate === true, 'second should be duplicate')

    const events = await p.mmScannerEvent.findMany({
        where: { idempotencyKey: idem },
    })
    assert(events.length === 1, 'only one SUCCESS event for idempotency key')

    // Auth failure
    let authFailed = false
    try {
        await j('POST', '/mm/scanner/events', {
            ...payload,
            user_id: 'not-a-real-user',
            idempotency_key: `${idem}-bad-user`,
        })
    } catch (e) {
        authFailed = true
        console.log('auth reject OK')
    }
    assert(authFailed, 'unknown user must fail')

    console.log('MM-17 smoke OK')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => p.$disconnect())
