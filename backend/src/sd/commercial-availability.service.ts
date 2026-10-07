import { Injectable } from '@nestjs/common'
import {
    atpPairKey,
    InventoryAvailabilityService,
} from '../mm/inventory/inventory-availability.service'
import { PrismaService } from '../prisma/prisma.service'
import { SdIntegrationService } from '../mm/integration/sd/sd-integration.service'
import { MaterialResolutionService } from './material-resolution.service'
import { FulfillmentDeterminationService } from './fulfillment-determination.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'

export type CommercialAvailability = {
    productId: string
    materialId: string | null
    warehouseId: string | null
    availableBaseQty: number
    state: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_MAPPED' | 'NON_INVENTORY'
    lowStockThreshold?: number
}

export type CompanyMaterialLedger = {
    onHandQty: number
    availableQty: number
    reservedQty: number
}

@Injectable()
export class CommercialAvailabilityService {
    constructor(
        private materialResolution: MaterialResolutionService,
        private fulfillmentDetermination: FulfillmentDeterminationService,
        private sdIntegration: SdIntegrationService,
        private inventoryAtp: InventoryAvailabilityService,
        private prisma: PrismaService,
    ) {}

    /** Commercial stock (material master on hand − reserved) — catalog & storefront ATP. */
    async getCompanyMaterialLedger(
        materialId: string,
        companyId: string,
    ): Promise<CompanyMaterialLedger> {
        const totals = await this.inventoryAtp.getCommercialMaterialTotals(
            companyId,
            materialId,
        )
        return {
            onHandQty: totals.onHandQty,
            availableQty: totals.availableQty,
            reservedQty: totals.reservedQty,
        }
    }

    /**
     * Ecommerce ATP uses the warehouse with the highest unrestricted available qty
     * (same sellable qty shown as Stock available in Product Catalog).
     */
    private async resolveFulfillmentWarehouse(args: {
        companyId: string
        materialId: string
        channel?: string
        branchId?: string | null
        divisionId?: string | null
    }): Promise<string> {
        const channel = args.channel ?? 'ECOMMERCE'
        if (args.branchId) {
            const resolved = await this.fulfillmentDetermination.determineWarehouse({
                companyId: args.companyId,
                channel,
                branchId: args.branchId,
                divisionId: args.divisionId,
                materialId: args.materialId,
            })
            return resolved.warehouseId
        }

        if (channel === 'ECOMMERCE') {
            const warehouses = await this.prisma.warehouse.findMany({
                where: {
                    companyId: args.companyId,
                    status: 'ACTIVE',
                    deletedAt: null,
                },
                orderBy: { code: 'asc' },
            })
            if (warehouses.length) {
                const batch = await this.inventoryAtp.getAvailabilityBatch(
                    args.companyId,
                    warehouses.map((w) => ({
                        warehouseId: w.id,
                        materialId: args.materialId,
                    })),
                )
                let bestId = warehouses[0].id
                let bestAvail = -1
                for (const wh of warehouses) {
                    const avail =
                        batch.get(atpPairKey(wh.id, args.materialId))?.available ?? 0
                    if (avail > bestAvail) {
                        bestAvail = avail
                        bestId = wh.id
                    }
                }
                return bestId
            }
        }

        const resolved = await this.fulfillmentDetermination.determineWarehouse({
            companyId: args.companyId,
            channel,
            branchId: args.branchId,
            divisionId: args.divisionId,
            materialId: args.materialId,
        })
        return resolved.warehouseId
    }

    async getForProduct(args: {
        productId: string
        companyId: string
        divisionId?: string | null
        branchId?: string | null
        channel?: string
        quantity?: number
    }): Promise<CommercialAvailability> {
        try {
            const resolved = await this.materialResolution.resolveMaterialForProduct({
                productId: args.productId,
                companyId: args.companyId,
                divisionId: args.divisionId,
                channel: args.channel,
            })
            if (!resolved.atpRelevant) {
                return {
                    productId: args.productId,
                    materialId: resolved.materialId,
                    warehouseId: null,
                    availableBaseQty: 0,
                    state: 'NON_INVENTORY',
                }
            }
            const ledger = await this.getCompanyMaterialLedger(
                resolved.materialId,
                args.companyId,
            )
            const available = ledger.availableQty
            let state: CommercialAvailability['state'] = 'IN_STOCK'
            if (available <= 0) state = 'OUT_OF_STOCK'
            else if (available < 10) state = 'LOW_STOCK'
            let warehouseId: string | null = null
            try {
                warehouseId = await this.resolveFulfillmentWarehouse({
                    companyId: args.companyId,
                    materialId: resolved.materialId,
                    channel: args.channel,
                    branchId: args.branchId,
                    divisionId: args.divisionId,
                })
            } catch {
                warehouseId = null
            }
            return {
                productId: args.productId,
                materialId: resolved.materialId,
                warehouseId,
                availableBaseQty: available,
                state,
                lowStockThreshold: 10,
            }
        } catch (err) {
            if (
                err instanceof SdMmIntegrationException &&
                (err.code === SD_MM_ERROR.PRODUCT_MATERIAL_MAPPING_MISSING ||
                    err.code === SD_MM_ERROR.NON_INVENTORY_PRODUCT)
            ) {
                return {
                    productId: args.productId,
                    materialId: null,
                    warehouseId: null,
                    availableBaseQty: 0,
                    state:
                        err.code === SD_MM_ERROR.NON_INVENTORY_PRODUCT
                            ? 'NON_INVENTORY'
                            : 'NOT_MAPPED',
                }
            }
            throw err
        }
    }

    /** ATP for a material before an SD product exists (Product Catalog → Add product). */
    async getForLinkedMaterial(args: {
        materialId: string
        companyId: string
        divisionId?: string | null
        branchId?: string | null
        channel?: string
        quantity?: number
    }): Promise<Omit<CommercialAvailability, 'productId'>> {
        const ledger = await this.getCompanyMaterialLedger(
            args.materialId,
            args.companyId,
        )
        const available = ledger.availableQty
        let state: CommercialAvailability['state'] = 'IN_STOCK'
        if (available <= 0) state = 'OUT_OF_STOCK'
        else if (available < 10) state = 'LOW_STOCK'

        let warehouseId: string | null = null
        try {
            warehouseId = await this.resolveFulfillmentWarehouse({
                companyId: args.companyId,
                materialId: args.materialId,
                channel: args.channel,
                branchId: args.branchId,
                divisionId: args.divisionId,
            })
        } catch {
            warehouseId = null
        }

        return {
            materialId: args.materialId,
            warehouseId,
            availableBaseQty: available,
            state,
            lowStockThreshold: 10,
        }
    }
}
