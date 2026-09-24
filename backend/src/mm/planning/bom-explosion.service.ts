import { Inject, Injectable, Optional } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'
import {
    BOM_PROVIDER,
    BomProvider,
    NullBomProvider,
} from './bom-provider'
import { UomConversionsService } from '../uom-conversions/uom-conversions.service'
import {
    aggregateDependentDemands,
    type BomExplosionLine,
    type BomExplosionWarning,
    type PlanningDemandInput,
    resolveDemandWarehouses,
    walkBomExplosion,
} from './bom-explosion.pure'

export type BomExplosionFromDemandsInput = {
    companyId: string
    plantId?: string | null
    warehouseIds: string[]
    demands: PlanningDemandInput[]
    asOf: Date
    mode?: 'singleLevel' | 'multiLevel'
}

export type BomExplosionFromDemandsResult = {
    lines: BomExplosionLine[]
    dependentDemandByPair: Map<string, import('./projected-stock.service').DemandEvent[]>
    componentMaterialIds: string[]
    warnings: BomExplosionWarning[]
}

@Injectable()
export class BomExplosionService {
    private bomProvider: BomProvider

    constructor(
        private prisma: PrismaService,
        private uomConversions: UomConversionsService,
        @Optional() @Inject(BOM_PROVIDER) bomProvider: BomProvider | null,
    ) {
        this.bomProvider = bomProvider ?? new NullBomProvider()
    }

    async explodeFromDemands(
        input: BomExplosionFromDemandsInput,
    ): Promise<BomExplosionFromDemandsResult> {
        const mode = input.mode ?? 'multiLevel'
        const allLines: BomExplosionLine[] = []
        const allWarnings: BomExplosionWarning[] = []

        const parentMaterialIds = [
            ...new Set(input.demands.map((d) => d.materialId)),
        ]
        const materials = await this.prisma.mmMaterial.findMany({
            where: {
                companyId: input.companyId,
                id: { in: parentMaterialIds },
                deletedAt: null,
            },
            select: { id: true, materialCode: true, baseUomId: true },
        })
        const materialCodes = new Map(
            materials.map((m) => [m.id, m.materialCode]),
        )
        const materialBaseUom = new Map(
            materials.map((m) => [m.id, m.baseUomId]),
        )

        const componentIds = new Set<string>()

        for (const demand of input.demands) {
            const warehouses = resolveDemandWarehouses(
                demand,
                input.warehouseIds,
            )
            const parentCode =
                materialCodes.get(demand.materialId) ?? demand.materialId

            for (const warehouseId of warehouses) {
                const knownMaterialIds = new Set<string>(
                    [...materialCodes.keys()],
                )

                const { lines, warnings } = await walkBomExplosion({
                    parentMaterialId: demand.materialId,
                    parentMaterialCode: parentCode,
                    parentQuantity: demand.quantity,
                    warehouseId,
                    demandDate: demand.demandDate,
                    level: 1,
                    asOf: input.asOf,
                    mode,
                    visitedPath: [],
                    materialCodes,
                    materialBaseUom,
                    knownMaterialIds,
                    convertUom: async (materialId, fromUomId, toUomId, qty) =>
                        this.uomConversions.convertQuantity({
                            materialId,
                            fromUomId,
                            toUomId,
                            quantity: qty,
                        }),
                    getBom: async (materialId) => {
                        const req = {
                            companyId: input.companyId,
                            plantId: input.plantId,
                            materialId,
                            asOf: input.asOf,
                        }
                        const [header, components] = await Promise.all([
                            this.bomProvider.getBomHeader(req),
                            this.bomProvider.listComponents(req),
                        ])

                        const compIds = components.map(
                            (c) => c.componentMaterialId,
                        )
                        if (compIds.length) {
                            const compMaterials =
                                await this.prisma.mmMaterial.findMany({
                                    where: {
                                        companyId: input.companyId,
                                        id: { in: compIds },
                                        deletedAt: null,
                                    },
                                    select: {
                                        id: true,
                                        materialCode: true,
                                        baseUomId: true,
                                    },
                                })
                            for (const m of compMaterials) {
                                knownMaterialIds.add(m.id)
                                materialCodes.set(m.id, m.materialCode)
                                materialBaseUom.set(m.id, m.baseUomId)
                                componentIds.add(m.id)
                            }
                        }

                        return { header, components }
                    },
                })

                allLines.push(...lines)
                allWarnings.push(...warnings)
            }
        }

        for (const line of allLines) {
            if (!line.warningCode) {
                componentIds.add(line.componentMaterialId)
            }
        }

        return {
            lines: allLines,
            dependentDemandByPair: aggregateDependentDemands(allLines),
            componentMaterialIds: [...componentIds],
            warnings: allWarnings,
        }
    }
}
