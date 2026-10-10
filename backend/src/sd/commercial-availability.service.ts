import { BadRequestException, Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import {
    atpPairKey,
    InventoryAvailabilityService,
} from '../mm/inventory/inventory-availability.service'
import { UomConversionsService } from '../mm/uom-conversions/uom-conversions.service'
import { PrismaService } from '../prisma/prisma.service'
import { SdIntegrationService } from '../mm/integration/sd/sd-integration.service'
import { MaterialResolutionService } from './material-resolution.service'
import { FulfillmentDeterminationService } from './fulfillment-determination.service'
import { SD_MM_ERROR, SdMmIntegrationException } from './sd-integration.errors'
import type { MarketplaceCheckoutLineDto } from './dto/sales-order.dto'

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
        private uom: UomConversionsService,
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
     * Checkout is the last commercial gate before an SO is persisted. Resolve
     * sellable stock lines to their MM material/base quantity, combine duplicate
     * material requirements, then ask MM ATP for the fulfillment warehouse.
     *
     * This is a preflight only. The SD→MM reservation remains the concurrency
     * authority and rechecks ATP before it reserves stock.
     */
    async assertMarketplaceCheckoutAvailability(args: {
        companyId: string
        lines: ReadonlyArray<MarketplaceCheckoutLineDto>
        channel?: string
        branchId?: string | null
    }): Promise<void> {
        const requiredByMaterialWarehouse = new Map<
            string,
            {
                materialId: string
                warehouseId: string
                requiredQty: Decimal
                description: string
            }
        >()

        for (const line of args.lines) {
            const product = await this.materialResolution.findProductByDivisionSku(
                line.divisionId,
                line.sku,
            )
            if (!product) {
                throw new BadRequestException(
                    `Product ${line.sku} is no longer available. Please refresh your cart.`,
                )
            }
            if (product.productType !== 'STOCK_ITEM') continue

            let materialId: string | null = null
            let salesUomId: string | null = null

            if (line.variantId) {
                const variant = await this.prisma.sdProductVariant.findFirst({
                    where: {
                        id: line.variantId,
                        productId: product.id,
                        isActive: true,
                    },
                    select: {
                        materialId: true,
                        companyId: true,
                        salesUomId: true,
                        materialUomId: true,
                    },
                })
                if (!variant) {
                    throw new BadRequestException(
                        `Selected variant for ${product.name} is no longer available. Please refresh your cart.`,
                    )
                }
                if (variant.companyId && variant.companyId !== args.companyId) {
                    throw new BadRequestException(
                        `Selected variant for ${product.name} is unavailable for this store.`,
                    )
                }
                materialId = variant.materialId
                salesUomId = variant.salesUomId ?? variant.materialUomId
            }

            if (!materialId) {
                const resolved =
                    await this.materialResolution.resolveMaterialForProduct({
                        productId: product.id,
                        companyId: args.companyId,
                        divisionId: line.divisionId,
                        channel: args.channel ?? 'ECOMMERCE',
                    })
                if (!resolved.atpRelevant) continue
                materialId = resolved.materialId
                salesUomId =
                    resolved.salesUomId ??
                    resolved.materialUomId ??
                    resolved.baseUomId
            }

            const material = await this.prisma.mmMaterial.findUnique({
                where: { id: materialId },
                select: { baseUomId: true },
            })
            if (!material) {
                throw new BadRequestException(
                    `${product.name} is unavailable because its stock item is no longer configured.`,
                )
            }

            const baseQty = await this.toBaseQuantity(
                materialId,
                salesUomId ?? material.baseUomId,
                line.quantity,
            )
            const { warehouseId } =
                await this.fulfillmentDetermination.determineWarehouse({
                    companyId: args.companyId,
                    channel: args.channel ?? 'ECOMMERCE',
                    branchId: args.branchId,
                    divisionId: line.divisionId,
                    materialId,
                })
            const key = atpPairKey(warehouseId, materialId)
            const existing = requiredByMaterialWarehouse.get(key)
            if (existing) {
                existing.requiredQty = existing.requiredQty.plus(baseQty)
            } else {
                requiredByMaterialWarehouse.set(key, {
                    materialId,
                    warehouseId,
                    requiredQty: baseQty,
                    description: product.name,
                })
            }
        }

        const requirements = [...requiredByMaterialWarehouse.values()]
        const availabilityByPair = await this.inventoryAtp.getAvailabilityBatch(
            args.companyId,
            requirements.map(({ warehouseId, materialId }) => ({
                warehouseId,
                materialId,
            })),
        )

        for (const requirement of requirements) {
            const available =
                availabilityByPair.get(
                    atpPairKey(requirement.warehouseId, requirement.materialId),
                )?.available ?? 0
            if (requirement.requiredQty.gt(available)) {
                throw new BadRequestException(
                    `${requirement.description} is out of stock. Available: ${available}; requested: ${requirement.requiredQty.toString()}. Please update your cart.`,
                )
            }
        }
    }

    private async toBaseQuantity(
        materialId: string,
        salesUomId: string,
        quantity: number,
    ): Promise<Decimal> {
        try {
            return (await this.uom.toBaseUom(materialId, salesUomId, quantity))
                .quantity
        } catch (error) {
            // Match the SD→MM pipeline's legacy retail fallback until every
            // catalog assignment has an explicit UOM conversion.
            if (
                error instanceof Error &&
                /No UOM conversion found/i.test(error.message)
            ) {
                return new Decimal(quantity)
            }
            throw error
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
