import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CommercialAvailabilityService } from './commercial-availability.service'

/** Read-only MM snapshot for SD Product Catalog (no MM write path). */
@Injectable()
export class SdMaterialReferenceService {
    constructor(
        private prisma: PrismaService,
        private commercialAvailability: CommercialAvailabilityService,
    ) {}

    async getForProductCatalog(
        materialId: string,
        companyId: string,
        divisionId?: string,
    ) {
        if (!materialId?.trim() || !companyId?.trim()) {
            throw new BadRequestException('materialId and companyId are required')
        }

        const material = await this.prisma.mmMaterial.findFirst({
            where: { id: materialId.trim(), deletedAt: null },
            include: {
                materialType: { select: { code: true, name: true } },
                materialCategory: { select: { code: true, name: true } },
                baseUom: { select: { id: true, code: true, name: true } },
                salesUom: { select: { id: true, code: true, name: true } },
                purchaseUom: { select: { id: true, code: true, name: true } },
                currency: { select: { code: true, symbol: true } },
                valuationClass: { select: { code: true, name: true } },
            },
        })
        if (!material) throw new NotFoundException('Material not found')

        await this.prisma.company.findUniqueOrThrow({
            where: { id: companyId.trim() },
        })

        /** Stock thresholds on material master = source for product catalog & ecommerce. */
        const onHandQty = Number(material.onHandQty ?? 0)
        const reservedQty = Number(material.reservedQty ?? 0)
        const availableQty = Math.max(0, onHandQty - reservedQty)

        let fulfillmentAtpQty = availableQty
        let fulfillmentWarehouseCode: string | null = null
        try {
            const atp = await this.commercialAvailability.getForLinkedMaterial({
                materialId: material.id,
                companyId: companyId.trim(),
                divisionId: divisionId?.trim() || undefined,
                channel: 'ECOMMERCE',
            })
            fulfillmentAtpQty = atp.availableBaseQty
            if (atp.warehouseId) {
                const wh = await this.prisma.warehouse.findUnique({
                    where: { id: atp.warehouseId },
                    select: { code: true },
                })
                fulfillmentWarehouseCode = wh?.code ?? null
            }
        } catch {
            // Warehouse hint optional; stock thresholds remain the catalog source.
        }

        const dec = (v: unknown) => (v == null ? null : Number(v))

        let earliestExpiryDate: string | null = null
        let nearestBatchNumber: string | null = null
        if (material.expiryManaged) {
            const stockedBatches = await this.prisma.mmInventoryBalance.findMany({
                where: {
                    materialId: material.id,
                    companyId: companyId.trim(),
                    quantity: { gt: 0 },
                    batchId: { not: null },
                },
                select: {
                    batch: {
                        select: { expiryDate: true, batchNumber: true },
                    },
                },
            })
            for (const row of stockedBatches) {
                const exp = row.batch?.expiryDate
                if (!exp) continue
                if (
                    !earliestExpiryDate ||
                    exp.getTime() < new Date(earliestExpiryDate).getTime()
                ) {
                    earliestExpiryDate = exp.toISOString()
                    nearestBatchNumber = row.batch?.batchNumber ?? null
                }
            }
        }

        return {
            materialId: material.id,
            companyId: companyId.trim(),
            general: {
                materialCode: material.materialCode,
                materialName: material.materialName,
                sku: material.sku,
                brand: material.brand,
                model: material.model,
                manufacturer: material.manufacturer,
                shortDescription: material.shortDescription,
                description: material.description,
                status: material.status,
                materialType: material.materialType?.name ?? null,
                materialCategory: material.materialCategory?.name ?? null,
            },
            uom: {
                baseUomId: material.baseUomId,
                baseUomCode: material.baseUom?.code ?? null,
                baseUomName: material.baseUom?.name ?? null,
                salesUomId: material.salesUomId,
                salesUomCode: material.salesUom?.code ?? material.baseUom?.code ?? null,
                salesUomName: material.salesUom?.name ?? material.baseUom?.name ?? null,
                purchaseUomCode: material.purchaseUom?.code ?? null,
                purchaseUomName: material.purchaseUom?.name ?? null,
            },
            physical: {
                weight: dec(material.weight),
                weightUom: material.weightUom,
                length: dec(material.length),
                width: dec(material.width),
                height: dec(material.height),
                dimensionUom: material.dimensionUom,
                volume: dec(material.volume),
                volumeUom: material.volumeUom,
            },
            tracking: {
                inventoryManaged: material.inventoryManaged,
                batchManaged: material.batchManaged,
                serialManaged: material.serialManaged,
                expiryManaged: material.expiryManaged,
                sellable: material.sellable,
                purchasable: material.purchasable,
                qualityInspectionRequired: material.qualityInspectionRequired,
            },
            expiry: {
                defaultShelfLifeDays: material.defaultShelfLifeDays,
                earliestExpiryDate,
                nearestBatchNumber,
            },
            inventory: {
                minimumStock: Number(material.minimumStock),
                maximumStock: Number(material.maximumStock),
                safetyStock: Number(material.safetyStock),
                reorderPoint: Number(material.reorderPoint),
                onHandQty,
                availableQty,
                reservedQty,
                /** Sellable qty in catalog & ecommerce = MM Available (on hand − reserved, company). */
                stockAvailable: availableQty,
                stockAvailableState:
                    availableQty <= 0
                        ? 'OUT_OF_STOCK'
                        : availableQty < 10
                          ? 'LOW_STOCK'
                          : 'IN_STOCK',
                fulfillmentAtpQty,
                fulfillmentWarehouseCode,
            },
            valuation: {
                valuationMethod: material.valuationMethod,
                standardCost: Number(material.standardCost),
                currencyCode: material.currency?.code ?? 'PHP',
                valuationClass: material.valuationClass?.name ?? null,
            },
        }
    }

    async getBatchForProductCatalog(
        materialIds: string[],
        companyId: string,
        divisionId?: string,
    ) {
        const unique = [...new Set(materialIds.map((id) => id.trim()).filter(Boolean))]
        if (!unique.length || !companyId?.trim()) {
            throw new BadRequestException('materialIds and companyId are required')
        }

        const materials = await Promise.all(
            unique.map((id) => this.getForProductCatalog(id, companyId, divisionId)),
        )

        const totals = materials.reduce(
            (acc, row) => {
                acc.availableQty += row.inventory.availableQty
                acc.onHandQty += row.inventory.onHandQty
                acc.maximumStock += row.inventory.maximumStock
                acc.safetyStock += row.inventory.safetyStock
                acc.stockAvailable = Math.min(
                    acc.stockAvailable,
                    row.inventory.availableQty,
                )
                return acc
            },
            {
                availableQty: 0,
                onHandQty: 0,
                maximumStock: 0,
                safetyStock: 0,
                stockAvailable: Number.POSITIVE_INFINITY,
            },
        )
        if (totals.stockAvailable === Number.POSITIVE_INFINITY) {
            totals.stockAvailable = 0
        }

        return { materials, totals, companyId: companyId.trim(), divisionId: divisionId ?? null }
    }
}
