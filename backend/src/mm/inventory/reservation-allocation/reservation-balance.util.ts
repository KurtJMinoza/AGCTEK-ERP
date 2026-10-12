import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { BadRequestException } from '@nestjs/common'

type Tx = Prisma.TransactionClient | { mmInventoryBalance: Prisma.TransactionClient['mmInventoryBalance'] }

/**
 * Reservation bucket aligned with the storefront ATP: stock physically sits
 * in a storage bin (storageBinId != null), so reservations must deduct from
 * the SAME bin-scoped balance rows that Product Catalog / ecommerce read.
 * Creating a bin-less reservation row (storageBinId=null) made it invisible
 * to bin-scoped ATP — sold stock never reduced the storefront.
 */
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
    // Prefer bin-assigned balances (pickable stock). Fall back to the
    // warehouse-level bucket (storageBinId null) when no bin-assigned rows
    // exist — e.g. demo/legacy stock posted without a destination bin.
    const where = {
        companyId: args.companyId,
        warehouseId: args.warehouseId,
        materialId: args.materialId,
        batchId: args.batchId ?? null,
        serialNumberId: args.serialNumberId ?? null,
        stockStatus,
    }
    const binBalances = await tx.mmInventoryBalance.findMany({
        where: { ...where, storageBinId: { not: null } },
    })
    let remaining = args.quantity
    if (binBalances.length > 0) {
        for (const bal of binBalances) {
            if (remaining.lte(0)) break
            const available = new Decimal(bal.availableQuantity)
            if (available.lte(0)) continue
            const take = Decimal.min(available, remaining)
            const newReserved = new Decimal(bal.reservedQuantity).plus(take)
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
                throw new BadRequestException('Concurrent reservation conflict — retry')
            }
            remaining = remaining.minus(take)
        }
        if (remaining.gt(0)) {
            // Bin rows had less free space than requested (e.g. some were
            // already reserved). Put the overflow on the warehouse bucket so
            // the reservation still records the full requested quantity.
            const whWhere = { ...where, storageBinId: null as string | null }
            const existing = await tx.mmInventoryBalance.findFirst({ where: whWhere })
            if (existing) {
                const newReserved = new Decimal(existing.reservedQuantity).plus(remaining)
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
            } else {
                await tx.mmInventoryBalance.create({
                    data: {
                        ...whWhere,
                        quantity: new Decimal(0),
                        reservedQuantity: remaining,
                        availableQuantity: new Decimal(0).minus(remaining),
                        version: 0,
                    },
                })
            }
        }
        return
    }

    const whWhere = { ...where, storageBinId: null as string | null }
    const existing = await tx.mmInventoryBalance.findFirst({ where: whWhere })
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
            ...whWhere,
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
    const base = {
        companyId: args.companyId,
        warehouseId: args.warehouseId,
        materialId: args.materialId,
        batchId: args.batchId ?? null,
        serialNumberId: args.serialNumberId ?? null,
        stockStatus,
    }
    // Release from bin-assigned rows first (reservations now land there),
    // then the warehouse-level bucket.
    const balances = await tx.mmInventoryBalance.findMany({
        where: { ...base, storageBinId: { not: null } },
    })
    const whBalances = await tx.mmInventoryBalance.findMany({
        where: { ...base, storageBinId: null },
    })

    for (const bal of [...balances, ...whBalances]) {
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
