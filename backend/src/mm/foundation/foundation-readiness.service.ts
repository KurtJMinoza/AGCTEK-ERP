import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class FoundationReadinessService {
    constructor(private prisma: PrismaService) {}

    async getReadiness() {
        const [
            materialTotal,
            materialActive,
            materialNoStandardCost,
            materialNegativeAllowed,
            supplierTotal,
            supplierMaterialLinks,
            warehouseTotal,
            binTotal,
            binsMissingCapacity,
            putawayRuleCount,
            pickingRuleCount,
            valuationProfileCount,
            materialsNoValuationMethod,
        ] = await Promise.all([
            this.prisma.mmMaterial.count({ where: { deletedAt: null } }),
            this.prisma.mmMaterial.count({
                where: { deletedAt: null, status: 'ACTIVE' },
            }),
            this.prisma.mmMaterial.count({
                where: {
                    deletedAt: null,
                    status: 'ACTIVE',
                    standardCost: new Decimal(0),
                },
            }),
            this.prisma.mmMaterial.count({
                where: { deletedAt: null, negativeStockAllowed: true },
            }),
            this.prisma.mmSupplier.count({ where: { deletedAt: null } }),
            this.prisma.mmSupplierMaterial.count(),
            this.prisma.warehouse.count({ where: { deletedAt: null } }),
            this.prisma.wmStorageBin.count({ where: { deletedAt: null } }),
            this.prisma.wmStorageBin.count({
                where: {
                    deletedAt: null,
                    capacityQuantity: new Decimal(0),
                    capacityWeight: new Decimal(0),
                    capacityVolume: new Decimal(0),
                },
            }),
            this.prisma.wmPutawayRule.count({ where: { isActive: true } }),
            this.prisma.wmPickingRule.count({ where: { isActive: true } }),
            this.prisma.mmMaterialValuation.count({ where: { isActive: true } }),
            this.prisma.mmMaterial.count({
                where: {
                    deletedAt: null,
                    status: 'ACTIVE',
                    inventoryManaged: true,
                    OR: [{ valuationMethod: null }, { valuationMethod: '' }],
                },
            }),
        ])

        return {
            generatedAt: new Date().toISOString(),
            steps: [
                {
                    step: 1,
                    key: 'material_master',
                    title: 'Material Master Setup',
                    role: 'Master Data Manager',
                    metrics: {
                        materialsTotal: materialTotal,
                        materialsActive: materialActive,
                        activeWithoutStandardCost: materialNoStandardCost,
                    },
                    ready:
                        materialActive > 0 && materialNoStandardCost === 0,
                },
                {
                    step: 2,
                    key: 'supplier_master',
                    title: 'Supplier Master Configuration',
                    role: 'Procurement Data Steward',
                    metrics: {
                        suppliersTotal: supplierTotal,
                        supplierMaterialLinks: supplierMaterialLinks,
                    },
                    ready: supplierTotal > 0 && supplierMaterialLinks > 0,
                },
                {
                    step: 3,
                    key: 'warehouse_structure',
                    title: 'Warehouse Structure Setup',
                    role: 'Warehouse Manager',
                    metrics: {
                        warehousesTotal: warehouseTotal,
                        storageBinsTotal: binTotal,
                        binsMissingCapacity,
                        activePutawayRules: putawayRuleCount,
                        activePickingRules: pickingRuleCount,
                    },
                    ready:
                        warehouseTotal > 0 &&
                        binTotal > 0 &&
                        putawayRuleCount > 0 &&
                        pickingRuleCount > 0,
                },
                {
                    step: 4,
                    key: 'inventory_valuation',
                    title: 'Inventory & Valuation Configuration',
                    role: 'Finance Controller',
                    metrics: {
                        valuationProfiles: valuationProfileCount,
                        inventoryMaterialsMissingValuationMethod:
                            materialsNoValuationMethod,
                        materialsWithNegativeStockAllowed: materialNegativeAllowed,
                    },
                    ready:
                        valuationProfileCount > 0 &&
                        materialsNoValuationMethod === 0,
                },
            ],
        }
    }
}
