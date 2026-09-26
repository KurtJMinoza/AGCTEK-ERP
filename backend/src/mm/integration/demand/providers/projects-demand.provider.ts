import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../../prisma/prisma.service'
import type { MmDemandProvider } from '../mm-demand-provider.port'
import {
    MM_DEMAND_MODULES,
    type MmDemandQuery,
    type MmNormalizedDemandLine,
} from '../mm-demand.types'
import {
    buildDemandReferenceKey,
    demandSourceTypeFromModule,
} from '../mm-demand.util'

/**
 * Projects demand — reads synced rows in mm_planning_demands for PROJECTS module.
 * External project systems push demand via MM integration API.
 */
@Injectable()
export class ProjectsDemandProvider implements MmDemandProvider {
    readonly moduleId = MM_DEMAND_MODULES.PROJECTS

    constructor(private prisma: PrismaService) {}

    async listOpenDemand(query: MmDemandQuery): Promise<MmNormalizedDemandLine[]> {
        const rows = await this.prisma.mmPlanningDemand.findMany({
            where: {
                companyId: query.companyId,
                sourceModule: this.moduleId,
                materialId: { in: query.materialIds },
                status: 'OPEN',
                demandDate: { gte: query.asOf, lte: query.horizonEnd },
                OR: [
                    { warehouseId: { in: query.warehouseIds } },
                    { warehouseId: null },
                ],
            },
            include: { material: { select: { baseUomId: true } } },
        })

        return rows.map((row) => ({
            sourceModule: row.sourceModule,
            sourceDocumentType: row.sourceDocumentType,
            sourceDocumentId: row.sourceDocumentId ?? row.id,
            sourceDocumentLineId: row.sourceDocumentLineId,
            companyId: row.companyId,
            materialId: row.materialId,
            warehouseId: row.warehouseId,
            plantId: row.plantId,
            requiredDate: row.demandDate,
            quantity: Number(row.quantity),
            uomId: row.uomId ?? row.material.baseUomId,
            priority: row.priority,
            status: 'OPEN',
            demandReferenceKey:
                row.demandReferenceKey ??
                buildDemandReferenceKey(
                    row.sourceModule,
                    row.sourceDocumentType,
                    row.sourceDocumentId ?? row.id,
                    row.sourceDocumentLineId,
                ),
            sourceType: row.sourceType ?? demandSourceTypeFromModule(this.moduleId),
            remarks: row.remarks,
        }))
    }
}
