import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InventoryPostingService } from '../inventory/inventory-posting.service'
import { postingKey } from '../common/idempotency.util'

export type BatchExpiryInfo = {
    expiryDate: Date | null
    shelfLifeDays: number | null
    daysRemaining: number | null
    isExpired: boolean
}

@Injectable()
export class ExpiryControlService {
    constructor(
        private prisma: PrismaService,
        private postingService: InventoryPostingService,
    ) {}

    /** Compute days remaining / expired from batch dates. */
    computeExpiryInfo(batch: {
        expiryDate?: Date | null
        shelfLifeDays?: number | null
        manufacturingDate?: Date | null
    }): BatchExpiryInfo {
        const expiryDate = batch.expiryDate ?? null
        const shelfLifeDays = batch.shelfLifeDays ?? null
        if (!expiryDate) {
            return {
                expiryDate: null,
                shelfLifeDays,
                daysRemaining: null,
                isExpired: false,
            }
        }
        const now = new Date()
        const msPerDay = 24 * 60 * 60 * 1000
        const daysRemaining = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / msPerDay,
        )
        return {
            expiryDate,
            shelfLifeDays,
            daysRemaining,
            isExpired: daysRemaining < 0,
        }
    }

    /**
     * Derive expiryDate from manufacturingDate + shelfLifeDays when expiry unset.
     * Prefer explicit shelfLifeDays, then material.defaultShelfLifeDays.
     */
    resolveExpiryDate(args: {
        manufacturingDate?: Date | null
        expiryDate?: Date | null
        shelfLifeDays?: number | null
        defaultShelfLifeDays?: number | null
    }): { expiryDate: Date | null; shelfLifeDays: number | null } {
        if (args.expiryDate) {
            return {
                expiryDate: args.expiryDate,
                shelfLifeDays: args.shelfLifeDays ?? args.defaultShelfLifeDays ?? null,
            }
        }
        const days = args.shelfLifeDays ?? args.defaultShelfLifeDays ?? null
        if (args.manufacturingDate && days != null && days > 0) {
            const expiry = new Date(args.manufacturingDate)
            expiry.setUTCDate(expiry.getUTCDate() + days)
            return { expiryDate: expiry, shelfLifeDays: days }
        }
        return { expiryDate: null, shelfLifeDays: days }
    }

    /**
     * When company/material autoBlockExpired is on, transfer past-expiry
     * UNRESTRICTED balances → configured status (default EXPIRED) via IPS.
     */
    async blockExpiredStock(companyId: string, actor?: string) {
        const cfg = await this.prisma.mmReturnsDisposalConfig.findUnique({
            where: { companyId },
        })
        const companyAuto = cfg?.autoBlockExpired ?? false
        const targetStatus = cfg?.expiredBlockStockStatus ?? 'EXPIRED'
        const now = new Date()

        const balances = await this.prisma.mmInventoryBalance.findMany({
            where: {
                companyId,
                stockStatus: 'UNRESTRICTED',
                quantity: { gt: 0 },
                batch: { expiryDate: { lt: now } },
            },
            include: {
                batch: true,
                material: {
                    select: {
                        id: true,
                        autoBlockExpired: true,
                        expiryManaged: true,
                        baseUomId: true,
                        standardCost: true,
                    },
                },
            },
        })

        const blocked: Array<{ balanceId: string; quantity: number; inventoryTxnId: string }> =
            []

        for (const bal of balances) {
            const materialAuto = bal.material?.autoBlockExpired ?? false
            if (!companyAuto && !materialAuto) continue
            const uomId = bal.material?.baseUomId
            if (!uomId) continue

            const qty = Number(bal.quantity)
            if (!(qty > 0)) continue

            const docKey = `${bal.materialId}:${bal.warehouseId}:${bal.batchId ?? 'na'}:${bal.id}`
            const postingDate = now.toISOString()
            const base = {
                companyId: bal.companyId,
                warehouseId: bal.warehouseId,
                storageBinId: bal.storageBinId ?? undefined,
                materialId: bal.materialId,
                batchId: bal.batchId ?? undefined,
                serialNumberId: bal.serialNumberId ?? undefined,
                quantity: qty,
                uomId,
                unitCost: Number(bal.material?.standardCost ?? 0),
                postingDate,
                documentDate: postingDate,
                sourceModule: 'RETURNS_DISPOSAL',
                sourceDocumentType: 'EXPIRY_AUTO_BLOCK',
                sourceDocumentId: docKey,
                reasonCode: 'EXPIRY',
                createdBy: actor,
            }

            await this.postingService.postTransaction({
                ...base,
                stockStatus: 'UNRESTRICTED',
                movementType: 'TRANSFER_OUT',
                idempotencyKey: postingKey('expiry-auto', docKey, 'unr-out'),
            })
            const txnIn = await this.postingService.postTransaction({
                ...base,
                stockStatus: targetStatus,
                movementType: 'TRANSFER_IN',
                idempotencyKey: postingKey('expiry-auto', docKey, `${targetStatus}-in`),
            })

            blocked.push({
                balanceId: bal.id,
                quantity: qty,
                inventoryTxnId: txnIn.id,
            })
        }

        return {
            companyId,
            targetStatus,
            blockedCount: blocked.length,
            blocked,
        }
    }

    /** True when FEFO / ATP should exclude this candidate. */
    isExpiredCandidate(args: {
        stockStatus?: string | null
        batchExpiry?: Date | null
        asOf?: Date
    }): boolean {
        if (args.stockStatus === 'EXPIRED') return true
        if (!args.batchExpiry) return false
        const asOf = args.asOf ?? new Date()
        return args.batchExpiry.getTime() < asOf.getTime()
    }
}
