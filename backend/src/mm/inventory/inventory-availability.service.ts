import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { RESTRICTED_STOCK_STATUSES } from './inventory.constants'
import { AvailabilityQueryDto } from './dto/availability-query.dto'

/**
 * Central availability engine (MM-08).
 *
 * Available = Unrestricted On-Hand − Reserved
 * Restricted stock is reported separately and excluded from ATP.
 */
export type AtpPairKey = string

export type AtpResult = {
    companyId: string
    warehouseId: string
    materialId: string
    storageBinId: string | null
    batchId: string | null
    serialNumberId: string | null
    onHand: number
    unrestrictedOnHand: number
    reserved: number
    restricted: number
    available: number
    unrestrictedStock: number
    existingReservations: number
    restrictedStock: number
    balances: Array<{
        id: string
        storageBinId: string | null
        stockStatus: string
        quantity: number
        reservedQuantity: number
        availableQuantity: number
        batchId: string | null
        serialNumberId: string | null
    }>
}

export function atpPairKey(
    warehouseId: string,
    materialId: string,
): AtpPairKey {
    return `${warehouseId}:${materialId}`
}

@Injectable()
export class InventoryAvailabilityService {
    constructor(private prisma: PrismaService) {}

    private aggregateBalances(
        companyId: string,
        warehouseId: string,
        materialId: string,
        balances: Array<{
            id: string
            storageBinId: string | null
            stockStatus: string
            quantity: any
            reservedQuantity: any
            availableQuantity: any
            batchId: string | null
            serialNumberId: string | null
        }>,
    ): AtpResult {
        let onHand = new Decimal(0)
        let unrestrictedOnHand = new Decimal(0)
        let reserved = new Decimal(0)
        let restricted = new Decimal(0)

        for (const b of balances) {
            const qty = new Decimal(b.quantity)
            const reservedQty = new Decimal(b.reservedQuantity)
            onHand = onHand.plus(qty)
            if (b.stockStatus === 'UNRESTRICTED') {
                unrestrictedOnHand = unrestrictedOnHand.plus(qty)
                reserved = reserved.plus(reservedQty)
            } else if (RESTRICTED_STOCK_STATUSES.has(b.stockStatus as any)) {
                restricted = restricted.plus(qty)
            }
        }

        const available = unrestrictedOnHand.minus(reserved)

        return {
            companyId,
            warehouseId,
            materialId,
            storageBinId: null,
            batchId: null,
            serialNumberId: null,
            onHand: Number(onHand),
            unrestrictedOnHand: Number(unrestrictedOnHand),
            reserved: Number(reserved),
            restricted: Number(restricted),
            available: Number(available),
            unrestrictedStock: Number(unrestrictedOnHand),
            existingReservations: Number(reserved),
            restrictedStock: Number(restricted),
            balances: balances.map((b) => ({
                id: b.id,
                storageBinId: b.storageBinId,
                stockStatus: b.stockStatus,
                quantity: Number(b.quantity),
                reservedQuantity: Number(b.reservedQuantity),
                availableQuantity: Number(b.availableQuantity),
                batchId: b.batchId,
                serialNumberId: b.serialNumberId,
            })),
        }
    }

    /** Batch ATP for MRP scope — one balance query, same semantics as getAvailability(). */
    async getAvailabilityBatch(
        companyId: string,
        pairs: { warehouseId: string; materialId: string }[],
    ): Promise<Map<AtpPairKey, AtpResult>> {
        const result = new Map<AtpPairKey, AtpResult>()
        if (!pairs.length) return result

        const warehouseIds = [...new Set(pairs.map((p) => p.warehouseId))]
        const materialIds = [...new Set(pairs.map((p) => p.materialId))]
        const pairSet = new Set(pairs.map((p) => atpPairKey(p.warehouseId, p.materialId)))

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId,
                warehouseId: { in: warehouseIds },
                materialId: { in: materialIds },
            },
            select: {
                id: true,
                warehouseId: true,
                materialId: true,
                storageBinId: true,
                stockStatus: true,
                quantity: true,
                reservedQuantity: true,
                availableQuantity: true,
                batchId: true,
                serialNumberId: true,
            },
        })

        const grouped = new Map<AtpPairKey, typeof balances>()
        for (const b of balances) {
            const key = atpPairKey(b.warehouseId, b.materialId)
            if (!pairSet.has(key)) continue
            const list = grouped.get(key) ?? []
            list.push(b)
            grouped.set(key, list)
        }

        for (const p of pairs) {
            const key = atpPairKey(p.warehouseId, p.materialId)
            result.set(
                key,
                this.aggregateBalances(
                    companyId,
                    p.warehouseId,
                    p.materialId,
                    grouped.get(key) ?? [],
                ),
            )
        }

        return result
    }

    async getAvailability(query: AvailabilityQueryDto): Promise<AtpResult> {
        const baseWhere: Record<string, string> = {
            companyId: query.companyId,
            warehouseId: query.warehouseId,
            materialId: query.materialId,
        }
        if (query.storageBinId) baseWhere.storageBinId = query.storageBinId
        if (query.batchId) baseWhere.batchId = query.batchId
        if (query.serialNumberId) baseWhere.serialNumberId = query.serialNumberId

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: baseWhere,
            include: {
                storageBin: true,
                batch: true,
                serialNumber: true,
            },
        })

        return this.aggregateBalances(
            query.companyId,
            query.warehouseId,
            query.materialId,
            balances,
        )
    }

    /** Backward-compatible alias used by ReservationService. */
    async getAtp(query: AvailabilityQueryDto) {
        return this.getAvailability(query)
    }

    async assertAvailable(
        companyId: string,
        warehouseId: string,
        materialId: string,
        requiredQty: Decimal | number,
        opts?: {
            storageBinId?: string | null
            batchId?: string | null
            serialNumberId?: string | null
        },
    ) {
        const result = await this.getAvailability({
            companyId,
            warehouseId,
            materialId,
            storageBinId: opts?.storageBinId ?? undefined,
            batchId: opts?.batchId ?? undefined,
            serialNumberId: opts?.serialNumberId ?? undefined,
        })
        const needed = new Decimal(requiredQty)
        if (needed.gt(result.available)) {
            return {
                ok: false as const,
                available: result.available,
                required: Number(needed),
                atp: result,
            }
        }
        return {
            ok: true as const,
            available: result.available,
            required: Number(needed),
            atp: result,
        }
    }
}
