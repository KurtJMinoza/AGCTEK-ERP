import type { PrismaClient } from '@prisma/client'
import { purgeInventoryTransactions } from './delete-inventory-ledger'

export async function hardDeleteBatchByNumber(
    prisma: PrismaClient,
    materialCode: string,
    batchNumber: string,
): Promise<boolean> {
    const batch = await prisma.mmBatch.findFirst({
        where: { batchNumber, material: { materialCode }, deletedAt: null },
    })
    if (!batch) {
        console.log(`  Batch not found: ${materialCode} / ${batchNumber}`)
        return false
    }

    const txns = await prisma.mmInventoryTransaction.findMany({
        where: { batchId: batch.id },
        select: { id: true },
    })
    await purgeInventoryTransactions(
        prisma,
        txns.map((t) => t.id),
    )
    await prisma.mmInventoryBalance.deleteMany({ where: { batchId: batch.id } })
    await prisma.mmInventoryReservation.deleteMany({ where: { batchId: batch.id } })

    await prisma.mmBatch.update({
        where: { id: batch.id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
    })
    console.log(`  Removed batch ${batchNumber} (${materialCode})`)
    return true
}

export async function hardDeleteSerialByNumber(
    prisma: PrismaClient,
    materialCode: string,
    serialNumber: string,
): Promise<boolean> {
    const serial = await prisma.mmSerialNumber.findFirst({
        where: {
            serialNumber,
            material: { materialCode },
            deletedAt: null,
        },
    })
    if (!serial) {
        console.log(`  Serial not found: ${materialCode} / ${serialNumber}`)
        return false
    }

    const txns = await prisma.mmInventoryTransaction.findMany({
        where: { serialNumberId: serial.id },
        select: { id: true },
    })
    await purgeInventoryTransactions(
        prisma,
        txns.map((t) => t.id),
    )
    await prisma.mmInventoryBalance.deleteMany({ where: { serialNumberId: serial.id } })
    await prisma.mmInventoryReservation.deleteMany({ where: { serialNumberId: serial.id } })

    await prisma.mmSerialNumber.update({
        where: { id: serial.id },
        data: {
            deletedAt: new Date(),
            status: 'INACTIVE',
            currentWarehouseId: null,
            currentBinId: null,
        },
    })
    console.log(`  Removed serial ${serialNumber} (${materialCode})`)
    return true
}
