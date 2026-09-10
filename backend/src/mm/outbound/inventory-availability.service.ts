import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import { AtpQueryDto } from './dto/reservation.dto'

/**
 * Available-to-Promise:
 * Unrestricted Stock − Existing Reservations − Restricted Stock = Available
 *
 * Restricted (QI / BLOCKED / etc.) is excluded from unrestricted and reported separately.
 * Reservations reduce available via MmInventoryBalance.reservedQuantity (not on-hand).
 */
@Injectable()
export class InventoryAvailabilityService {
    constructor(private prisma: PrismaService) {}

    async getAtp(query: AtpQueryDto) {
        const baseWhere: any = {
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

        let unrestrictedStock = new Decimal(0)
        let reservedStock = new Decimal(0)
        let restrictedStock = new Decimal(0)

        for (const b of balances) {
            const qty = new Decimal(b.quantity)
            const reserved = new Decimal(b.reservedQuantity)
            if (b.stockStatus === 'UNRESTRICTED') {
                unrestrictedStock = unrestrictedStock.plus(qty)
                reservedStock = reservedStock.plus(reserved)
            } else {
                restrictedStock = restrictedStock.plus(qty)
            }
        }

        const available = unrestrictedStock.minus(reservedStock)

        return {
            companyId: query.companyId,
            warehouseId: query.warehouseId,
            materialId: query.materialId,
            storageBinId: query.storageBinId ?? null,
            batchId: query.batchId ?? null,
            serialNumberId: query.serialNumberId ?? null,
            unrestrictedStock: Number(unrestrictedStock),
            existingReservations: Number(reservedStock),
            restrictedStock: Number(restrictedStock),
            available: Number(available),
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
        const atp = await this.getAtp({
            companyId,
            warehouseId,
            materialId,
            storageBinId: opts?.storageBinId ?? undefined,
            batchId: opts?.batchId ?? undefined,
            serialNumberId: opts?.serialNumberId ?? undefined,
        })
        const needed = new Decimal(requiredQty)
        if (needed.gt(atp.available)) {
            return {
                ok: false as const,
                available: atp.available,
                required: Number(needed),
                atp,
            }
        }
        return { ok: true as const, available: atp.available, required: Number(needed), atp }
    }
}
