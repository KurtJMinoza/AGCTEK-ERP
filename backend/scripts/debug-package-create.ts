import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

async function main() {
    const w = await p.warehouse.findFirst()
    const m = await p.mmMaterial.findFirst()
    console.log('warehouse', w?.id, 'material', m?.id)
    if (!w || !m) return

    try {
        const r = await p.wmPackage.create({
            data: {
                packageNumber: `PKG-DEBUG-${Date.now()}`,
                warehouseId: w.id,
                status: 'OPEN',
                items: {
                    create: [
                        {
                            materialId: m.id,
                            expectedQty: 1,
                            status: 'PENDING',
                        },
                    ],
                },
            },
            include: {
                items: { include: { material: true } },
                warehouse: true,
                pickingTask: true,
                reservation: true,
                packingSession: true,
            },
        })
        const s = JSON.stringify(r)
        console.log('ok', r.packageNumber, 'len', s.length, 'item qty type', typeof r.items[0]?.expectedQty)
    } catch (e) {
        console.error('ERR', e)
    }
}

main()
    .finally(() => p.$disconnect())
