import { Injectable } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import type { MmDemandQuery, MmNormalizedDemandLine } from './mm-demand.types'
import { MmDemandRegistryService } from './mm-demand-registry.service'
import { toPlanningDemandShape } from './mm-demand.util'

export type MrpPlanningDemandRow = {
    id: string
    materialId: string
    sourceModule: string
    sourceDocumentType: string
    sourceDocumentId: string | null
    sourceDocumentLineId: string | null
    sourceType: string
    demandDate: Date
    quantity: Decimal
    warehouseId: string | null
    plantId?: string | null
    uomId?: string | null
    priority: number
    status: string
    demandReferenceKey: string
}

/**
 * Single MRP demand loader — merges live provider feeds with persisted planning demands.
 * MRP never calls SD/PP/Maintenance/Projects directly.
 */
@Injectable()
export class MmDemandAggregationService {
    constructor(
        private prisma: PrismaService,
        private registry: MmDemandRegistryService,
    ) {}

    async loadForMrp(query: MmDemandQuery): Promise<MrpPlanningDemandRow[]> {
        const statuses = query.statuses ?? ['OPEN']
        const providerLines = await this.registry.listOpenDemand({
            ...query,
            statuses,
        })

        const manualRows = await this.prisma.mmPlanningDemand.findMany({
            where: {
                companyId: query.companyId,
                materialId: { in: query.materialIds },
                status: { in: statuses },
                demandDate: { gte: query.asOf, lte: query.horizonEnd },
                OR: [
                    { warehouseId: { in: query.warehouseIds } },
                    { warehouseId: null },
                ],
                demandReferenceKey: null,
            },
        })

        const byKey = new Map<string, MrpPlanningDemandRow>()

        for (const line of providerLines) {
            if (!statuses.includes(line.status as any)) continue
            if (
                line.warehouseId &&
                query.warehouseIds.length &&
                !query.warehouseIds.includes(line.warehouseId)
            ) {
                continue
            }
            const shaped = toPlanningDemandShape(line)
            byKey.set(line.demandReferenceKey, {
                ...shaped,
                quantity: new Decimal(shaped.quantity),
            })
        }

        for (const row of manualRows) {
            byKey.set(row.id, {
                id: row.id,
                materialId: row.materialId,
                sourceModule: row.sourceModule,
                sourceDocumentType: row.sourceDocumentType,
                sourceDocumentId: row.sourceDocumentId,
                sourceDocumentLineId: row.sourceDocumentLineId,
                sourceType: row.sourceType,
                demandDate: row.demandDate,
                quantity: new Decimal(row.quantity),
                warehouseId: row.warehouseId,
                plantId: row.plantId,
                uomId: row.uomId,
                priority: row.priority,
                status: row.status,
                demandReferenceKey: row.demandReferenceKey ?? row.id,
            })
        }

        return [...byKey.values()].sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority
            return a.demandDate.getTime() - b.demandDate.getTime()
        })
    }

    toNormalizedLines(rows: MrpPlanningDemandRow[]): MmNormalizedDemandLine[] {
        return rows.map((r) => ({
            sourceModule: r.sourceModule,
            sourceDocumentType: r.sourceDocumentType,
            sourceDocumentId: r.sourceDocumentId ?? '',
            sourceDocumentLineId: r.sourceDocumentLineId,
            companyId: '',
            materialId: r.materialId,
            warehouseId: r.warehouseId,
            plantId: r.plantId,
            requiredDate: r.demandDate,
            quantity: Number(r.quantity),
            uomId: r.uomId ?? '',
            priority: r.priority,
            status: r.status as MmNormalizedDemandLine['status'],
            demandReferenceKey: r.demandReferenceKey,
            sourceType: r.sourceType,
        }))
    }
}
