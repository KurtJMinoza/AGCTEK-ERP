import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { BadRequestException } from '@nestjs/common'

type Tx = Prisma.TransactionClient | { mmInventoryBalance: Prisma.TransactionClient['mmInventoryBalance'] }

/** Warehouse-level reservation bucket (storageBinId=null) — no physical qty movement. */
export async function reserveWarehouseQuantity(
    tx: Tx,
    args: {
        companyId: string
        warehouseId: string
        materialId: string
        quantity: Decimal
        stockStatus?: string
        batchId?: string | null
        serialNumberId?: string | null
    },
) {
    const stockStatus = args.stockStatus ?? 'UNRESTRICTED'
    const where = {
        companyId: args.companyId,
        warehouseId: args.warehouseId,
        materialId: args.materialId,
        storageBinId: null as string | null,
        batchId: args.batchId ?? null,
        serialNumberId: args.serialNumberId ?? null,
        stockStatus,
    }

    const existing = await tx.mmInventoryBalance.findFirst({ where })
    if (existing) {
        const newReserved = new Decimal(existing.reservedQuantity).plus(args.quantity)
        const newAvailable = new Decimal(existing.quantity).minus(newReserved)
        const updated = await tx.mmInventoryBalance.updateMany({
            where: { id: existing.id, version: existing.version },
            data: {
                reservedQuantity: newReserved,
                availableQuantity: newAvailable,
                version: { increment: 1 },
            },
        })
        if (updated.count === 0) {
            throw new BadRequestException('Concurrent reservation conflict — retry')
        }
        return
    }

    await tx.mmInventoryBalance.create({
        data: {
            ...where,
            quantity: new Decimal(0),
            reservedQuantity: args.quantity,
            availableQuantity: new Decimal(0).minus(args.quantity),
            version: 0,
        },
    })
}

export async function releaseWarehouseQuantity(
    tx: Tx,
    args: {
        companyId: string
        warehouseId: string
        materialId: string
        quantity: Decimal
        stockStatus?: string
        batchId?: string | null
        serialNumberId?: string | null
    },
) {
    const stockStatus = args.stockStatus ?? 'UNRESTRICTED'
    let remaining = args.quantity
    const balances = await tx.mmInventoryBalance.findMany({
        where: {
            companyId: args.companyId,
            warehouseId: args.warehouseId,
            materialId: args.materialId,
            storageBinId: null,
            batchId: args.batchId ?? null,
            serialNumberId: args.serialNumberId ?? null,
            stockStatus,
        },
    })

    for (const bal of balances) {
        if (remaining.lte(0)) break
        const reserved = new Decimal(bal.reservedQuantity)
        if (reserved.lte(0)) continue
        const take = Decimal.min(reserved, remaining)
        const newReserved = reserved.minus(take)
        const newAvailable = new Decimal(bal.quantity).minus(newReserved)
        const updated = await tx.mmInventoryBalance.updateMany({
            where: { id: bal.id, version: bal.version },
            data: {
                reservedQuantity: newReserved,
                availableQuantity: newAvailable,
                version: { increment: 1 },
            },
        })
        if (updated.count === 0) {
            throw new BadRequestException('Concurrent reservation release conflict — retry')
        }
        remaining = remaining.minus(take)
    }
}
