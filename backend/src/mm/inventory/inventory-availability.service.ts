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
@Injectable()
export class InventoryAvailabilityService {
    constructor(private prisma: PrismaService) {}

    async getAvailability(query: AvailabilityQueryDto) {
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
            companyId: query.companyId,
            warehouseId: query.warehouseId,
            materialId: query.materialId,
            storageBinId: query.storageBinId ?? null,
            batchId: query.batchId ?? null,
            serialNumberId: query.serialNumberId ?? null,
            onHand: Number(onHand),
            unrestrictedOnHand: Number(unrestrictedOnHand),
            reserved: Number(reserved),
            restricted: Number(restricted),
            available: Number(available),
            /** @deprecated use `available` — kept for reservation controller compat */
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
