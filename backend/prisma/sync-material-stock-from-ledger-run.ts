import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

function aggregate(
    balances: Array<{ stockStatus: string; quantity: Decimal; reservedQuantity: Decimal }>,
) {
    let onHand = new Decimal(0)
    let unrestricted = new Decimal(0)
    let reserved = new Decimal(0)
    for (const b of balances) {
        onHand = onHand.plus(b.quantity)
        if (b.stockStatus === 'UNRESTRICTED') {
            unrestricted = unrestricted.plus(b.quantity)
            reserved = reserved.plus(b.reservedQuantity)
        }
    }
    const available = unrestricted.minus(reserved)
    return {
        onHandQty: Number(onHand),
        reservedQty: Number(reserved),
        availableQty: Math.max(0, Number(available)),
    }
}

async function main() {
    const materials = await prisma.mmMaterial.findMany({
        where: { deletedAt: null, companyId: { not: null } },
        select: { id: true, materialCode: true, companyId: true },
    })
    console.log(`Syncing ${materials.length} material(s) from inventory ledger…`)
    for (const m of materials) {
        const balances = await prisma.mmInventoryBalance.findMany({
            where: { companyId: m.companyId!, materialId: m.id },
            select: { stockStatus: true, quantity: true, reservedQuantity: true },
        })
        const totals = aggregate(balances)
        await prisma.mmMaterial.update({
            where: { id: m.id },
            data: {
                onHandQty: new Decimal(totals.onHandQty),
                reservedQty: new Decimal(totals.reservedQty),
            },
        })
        console.log(
            `  ${m.materialCode}: onHand=${totals.onHandQty} reserved=${totals.reservedQty} available=${totals.availableQty}`,
        )
    }
    console.log('Done.')
}

main()
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
