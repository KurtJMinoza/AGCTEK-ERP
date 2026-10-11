import {
    BadRequestException,
    HttpException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
    CommercialAvailabilityService,
    type CompanyMaterialLedger,
    type WarehouseMaterialLedger,
} from './commercial-availability.service'
import { UomConversionsService } from '../mm/uom-conversions/uom-conversions.service'
import {
    ReorderRuleService,
    type ResolvedPlanningParams,
} from '../mm/planning/reorder-rule.service'

type CatalogWarehouse = {
    id: string
    code: string
    name: string
    plantId: string | null
}

type CatalogStockScope =
    | 'WAREHOUSE'
    | 'DEFAULT_WAREHOUSE'
    | 'COMPANY_ACTIVE_WAREHOUSES'

type StockThresholds = {
    minimumStock: number
    maximumStock: number
    safetyStock: number
    reorderPoint: number
    source: 'WAREHOUSE' | 'COMPANY' | 'MATERIAL' | 'AGGREGATE_WAREHOUSES'
}

const totalLedger = (rows: WarehouseMaterialLedger[]): CompanyMaterialLedger =>
    rows.reduce(
        (totals, row) => ({
            onHandQty: totals.onHandQty + row.onHandQty,
            availableQty: totals.availableQty + row.availableQty,
            reservedQty: totals.reservedQty + row.reservedQty,
        }),
        { onHandQty: 0, availableQty: 0, reservedQty: 0 },
    )

const thresholdFromMaterial = (material: {
    minimumStock: unknown
    maximumStock: unknown
    safetyStock: unknown
    reorderPoint: unknown
}): StockThresholds => ({
    minimumStock: Number(material.minimumStock),
    maximumStock: Number(material.maximumStock),
    safetyStock: Number(material.safetyStock),
    reorderPoint: Number(material.reorderPoint),
    source: 'MATERIAL',
})

const thresholdFromParams = (
    params: ResolvedPlanningParams,
): StockThresholds => ({
    minimumStock: Number(params.minStock),
    maximumStock: Number(params.maxStock),
    safetyStock: Number(params.safetyStock),
    reorderPoint: Number(params.reorderPoint),
    source: params.scope,
})

const httpMessage = (error: unknown): string => {
    if (error instanceof HttpException) {
        const response = error.getResponse()
        if (typeof response === 'string') return response
        if (response && typeof response === 'object') {
            const message = (response as { message?: unknown }).message
            if (Array.isArray(message)) return message.join(', ')
            if (typeof message === 'string') return message
        }
        return error.message
    }
    if (error instanceof Error) return error.message
    return 'Unable to read MM stock for this material'
}

/** Read-only MM snapshot for one material (Product Catalog stock API shape). */
export type MaterialCatalogReference = Awaited<
    ReturnType<SdMaterialReferenceService['getForProductCatalog']>
>

/** Read-only MM snapshot for SD Product Catalog (no MM write path). */
@Injectable()
export class SdMaterialReferenceService {
    constructor(
        private prisma: PrismaService,
        private commercialAvailability: CommercialAvailabilityService,
        private uomConversions: UomConversionsService,
        private reorderRules: ReorderRuleService,
    ) {}

    async getForProductCatalog(
        materialId: string,
        companyId: string,
        divisionId?: string,
        warehouseId?: string,
        plantId?: string,
    ) {
        if (!materialId?.trim() || !companyId?.trim()) {
            throw new BadRequestException('materialId and companyId are required')
        }

        const scopedCompanyId = companyId.trim()
        const requestedWarehouseId = warehouseId?.trim() || null
        const requestedPlantId = plantId?.trim() || null
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
                defaultWarehouse: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        companyId: true,
                        plantId: true,
                        status: true,
                        deletedAt: true,
                    },
                },
            },
        })
        if (!material) throw new NotFoundException('Material not found')

        if (material.companyId && material.companyId !== scopedCompanyId) {
            throw new BadRequestException(
                'Material does not belong to the requested company',
            )
        }

        await this.prisma.company.findUniqueOrThrow({
            where: { id: scopedCompanyId },
        })

        const activeWarehouses = await this.prisma.warehouse.findMany({
            where: {
                companyId: scopedCompanyId,
                status: 'ACTIVE',
                deletedAt: null,
                ...(requestedPlantId ? { plantId: requestedPlantId } : {}),
            },
            select: { id: true, code: true, name: true, plantId: true },
            orderBy: { code: 'asc' },
        })

        let stockScope: CatalogStockScope = 'COMPANY_ACTIVE_WAREHOUSES'
        let warehouses: CatalogWarehouse[] = activeWarehouses
        if (requestedWarehouseId) {
            const selected = activeWarehouses.find(
                (warehouse) => warehouse.id === requestedWarehouseId,
            )
            if (!selected) {
                throw new BadRequestException(
                    'Selected warehouse is not an active warehouse for the requested company/plant',
                )
            }
            stockScope = 'WAREHOUSE'
            warehouses = [selected]
        } else {
            const defaultWarehouse = material.defaultWarehouse
            const isValidDefault =
                defaultWarehouse &&
                defaultWarehouse.companyId === scopedCompanyId &&
                defaultWarehouse.status === 'ACTIVE' &&
                defaultWarehouse.deletedAt === null &&
                (!requestedPlantId ||
                    defaultWarehouse.plantId === requestedPlantId)
            if (isValidDefault) {
                const selected = activeWarehouses.find(
                    (warehouse) => warehouse.id === defaultWarehouse.id,
                )
                if (selected) {
                    stockScope = 'DEFAULT_WAREHOUSE'
                    warehouses = [selected]
                }
            }
        }

        if (!warehouses.length) {
            throw new BadRequestException(
                'No active warehouse is available for the requested company/plant',
            )
        }

        const [ledgerByWarehouse, thresholdsByWarehouse] = await Promise.all([
            this.commercialAvailability.getCompanyMaterialLedgerByWarehouses(
                material.id,
                scopedCompanyId,
                warehouses.map((warehouse) => warehouse.id),
            ),
            this.reorderRules.resolveParamsForWarehouses({
                companyId: scopedCompanyId,
                materialId: material.id,
                warehouseIds: warehouses.map((warehouse) => warehouse.id),
                material: {
                    safetyStock: material.safetyStock,
                    reorderPoint: material.reorderPoint,
                    reorderQuantity: material.reorderQuantity,
                    minimumOrderQuantity: material.minimumOrderQuantity,
                    leadTimeDays: material.leadTimeDays,
                    maximumStock: material.maximumStock,
                },
            }),
        ])
        const ledger = totalLedger(ledgerByWarehouse)
        const materialThresholds = thresholdFromMaterial(material)
        const thresholdRows = warehouses.map((warehouse) => {
            const resolved = thresholdsByWarehouse.get(warehouse.id)
            return resolved
                ? thresholdFromParams(resolved)
                : materialThresholds
        })
        let thresholds = materialThresholds
        if (stockScope !== 'COMPANY_ACTIVE_WAREHOUSES') {
            thresholds = thresholdRows[0] ?? materialThresholds
        } else if (thresholdRows.some((row) => row.source === 'COMPANY')) {
            thresholds =
                thresholdRows.find((row) => row.source === 'COMPANY') ??
                materialThresholds
        } else if (
            thresholdRows.length > 0 &&
            thresholdRows.every((row) => row.source === 'WAREHOUSE')
        ) {
            thresholds = {
                minimumStock: thresholdRows.reduce(
                    (total, row) => total + row.minimumStock,
                    0,
                ),
                maximumStock: thresholdRows.reduce(
                    (total, row) => total + row.maximumStock,
                    0,
                ),
                safetyStock: thresholdRows.reduce(
                    (total, row) => total + row.safetyStock,
                    0,
                ),
                reorderPoint: thresholdRows.reduce(
                    (total, row) => total + row.reorderPoint,
                    0,
                ),
                source: 'AGGREGATE_WAREHOUSES',
            }
        }

        const salesUomId = material.salesUomId ?? material.baseUomId
        const salesUomCode =
            material.salesUom?.code ?? material.baseUom?.code ?? null
        const salesUomName =
            material.salesUom?.name ?? material.baseUom?.name ?? null
        const toSalesUom = async (quantity: number) => {
            if (salesUomId === material.baseUomId) return quantity
            return Number(
                await this.uomConversions.convertQuantity({
                    materialId: material.id,
                    fromUomId: material.baseUomId,
                    toUomId: salesUomId,
                    quantity,
                }),
            )
        }

        const convertThresholds = async (value: StockThresholds) => ({
            minimumStock: await toSalesUom(value.minimumStock),
            maximumStock: await toSalesUom(value.maximumStock),
            safetyStock: await toSalesUom(value.safetyStock),
            reorderPoint: await toSalesUom(value.reorderPoint),
            source: value.source,
        })
        const [onHandQty, availableQty, reservedQty, convertedThresholds] =
            await Promise.all([
                toSalesUom(ledger.onHandQty),
                toSalesUom(ledger.availableQty),
                toSalesUom(ledger.reservedQty),
                convertThresholds(thresholds),
            ])

        const warehouseBreakdown = await Promise.all(
            warehouses.map(async (warehouse) => {
                const warehouseLedger = ledgerByWarehouse.find(
                    (row) => row.warehouseId === warehouse.id,
                ) ?? {
                    warehouseId: warehouse.id,
                    onHandQty: 0,
                    availableQty: 0,
                    reservedQty: 0,
                }
                const warehouseThresholds =
                    thresholdRows[warehouses.indexOf(warehouse)] ??
                    materialThresholds
                const [onHand, available, reserved, threshold] =
                    await Promise.all([
                        toSalesUom(warehouseLedger.onHandQty),
                        toSalesUom(warehouseLedger.availableQty),
                        toSalesUom(warehouseLedger.reservedQty),
                        convertThresholds(warehouseThresholds),
                    ])
                return {
                    warehouseId: warehouse.id,
                    warehouseCode: warehouse.code,
                    warehouseName: warehouse.name,
                    plantId: warehouse.plantId,
                    onHand,
                    available,
                    reserved,
                    maxStock: threshold.maximumStock,
                    safetyStock: threshold.safetyStock,
                    thresholdSource: threshold.source,
                }
            }),
        )

        let earliestExpiryDate: string | null = null
        let nearestBatchNumber: string | null = null
        if (material.expiryManaged) {
            const stockedBatches = await this.prisma.mmInventoryBalance.findMany({
                where: {
                    materialId: material.id,
                    companyId: scopedCompanyId,
                    warehouseId: { in: warehouses.map((warehouse) => warehouse.id) },
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
                const expiryDate = row.batch?.expiryDate
                if (!expiryDate) continue
                if (
                    !earliestExpiryDate ||
                    expiryDate.getTime() < new Date(earliestExpiryDate).getTime()
                ) {
                    earliestExpiryDate = expiryDate.toISOString()
                    nearestBatchNumber = row.batch?.batchNumber ?? null
                }
            }
        }

        const stockAvailableState =
            availableQty <= 0
                ? 'OUT_OF_STOCK'
                : availableQty < 10
                  ? 'LOW_STOCK'
                  : 'IN_STOCK'
        const dec = (value: unknown) =>
            value == null ? null : Number(value)

        return {
            // Flat fields make this a stable, reusable Product Catalog stock API.
            materialId: material.id,
            materialCode: material.materialCode,
            materialName: material.materialName,
            companyId: scopedCompanyId,
            salesUom: salesUomCode,
            baseUom: material.baseUom?.code ?? null,
            onHand: onHandQty,
            available: availableQty,
            reserved: reservedQty,
            maxStock: convertedThresholds.maximumStock,
            safetyStock: convertedThresholds.safetyStock,
            standardCost: Number(material.standardCost),
            warehouseBreakdown,
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
                salesUomCode,
                salesUomName,
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
                minimumStock: convertedThresholds.minimumStock,
                maximumStock: convertedThresholds.maximumStock,
                safetyStock: convertedThresholds.safetyStock,
                reorderPoint: convertedThresholds.reorderPoint,
                onHandQty,
                availableQty,
                reservedQty,
                /** Sellable qty = unrestricted MM on-hand minus active reservations. */
                stockAvailable: availableQty,
                stockAvailableState,
                quantityUomCode: salesUomCode,
                stockScope,
                warehouseId:
                    warehouses.length === 1 ? warehouses[0].id : null,
                warehouseBreakdown,
                fulfillmentAtpQty:
                    warehouses.length === 1 ? availableQty : undefined,
                fulfillmentWarehouseCode:
                    warehouses.length === 1 ? warehouses[0].code : null,
            },
            valuation: {
                valuationMethod: material.valuationMethod,
                standardCost: Number(material.standardCost),
                currencyCode: material.currency?.code ?? 'PHP',
                valuationClass: material.valuationClass?.name ?? null,
            },
        }
    }

    /**
     * Batch stock preview for the Product Catalog material section.
     *
     * Each material is resolved independently: a material that cannot be read
     * (not found, wrong company, missing UOM conversion, …) is reported in
     * `failures` instead of failing the whole request. The Product Catalog must
     * never fall back to a false "0" for the materials that do resolve, and must
     * never silently show 0 for the ones that do not.
     */
    async getBatchForProductCatalog(
        materialIds: string[],
        companyId: string,
        divisionId?: string,
        warehouseId?: string,
        plantId?: string,
    ) {
        const unique = [
            ...new Set(materialIds.map((id) => id.trim()).filter(Boolean)),
        ]
        if (!unique.length || !companyId?.trim()) {
            throw new BadRequestException('materialIds and companyId are required')
        }

        const settled = await Promise.allSettled(
            unique.map((id) =>
                this.getForProductCatalog(
                    id,
                    companyId,
                    divisionId,
                    warehouseId,
                    plantId,
                ),
            ),
        )
        const materials: MaterialCatalogReference[] = []
        const failures: Array<{ materialId: string; error: string }> = []
        settled.forEach((result, index) => {
            const materialId = unique[index]
            if (result.status === 'fulfilled') {
                materials.push(result.value)
            } else {
                failures.push({
                    materialId,
                    error: httpMessage(result.reason),
                })
            }
        })

        const totals = materials.reduce(
            (acc, row) => {
                acc.availableQty += row.inventory.availableQty
                acc.onHandQty += row.inventory.onHandQty
                acc.reservedQty += row.inventory.reservedQty
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
                reservedQty: 0,
                maximumStock: 0,
                safetyStock: 0,
                stockAvailable: Number.POSITIVE_INFINITY,
            },
        )
        if (totals.stockAvailable === Number.POSITIVE_INFINITY) {
            totals.stockAvailable = 0
        }

        return {
            materials,
            failures,
            totals,
            companyId: companyId.trim(),
            divisionId: divisionId?.trim() || null,
            warehouseId: warehouseId?.trim() || null,
            plantId: plantId?.trim() || null,
        }
    }
}
