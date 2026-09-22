import { Injectable, Logger } from '@nestjs/common'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../../prisma/prisma.service'
import type { MmDemandSyncInput, MmNormalizedDemandLine } from './mm-demand.types'
import {
    buildDemandReferenceKey,
    demandSourceTypeFromModule,
} from './mm-demand.util'

@Injectable()
export class MmDemandSyncService {
    private readonly logger = new Logger(MmDemandSyncService.name)

    constructor(private prisma: PrismaService) {}

    normalize(input: MmDemandSyncInput): MmNormalizedDemandLine {
        const demandReferenceKey =
            input.demandReferenceKey ??
            buildDemandReferenceKey(
                input.sourceModule,
                input.sourceDocumentType,
                input.sourceDocumentId,
                input.sourceDocumentLineId,
            )
        return {
            ...input,
            demandReferenceKey,
            sourceType:
                input.sourceType ?? demandSourceTypeFromModule(input.sourceModule),
        }
    }

    /** Idempotent upsert of a normalized demand line into mm_planning_demands. */
    async upsertLine(input: MmDemandSyncInput) {
        const line = this.normalize(input)
        if (line.status === 'CANCELLED') {
            return this.cancelByReferenceKey(line.demandReferenceKey)
        }

        return this.prisma.mmPlanningDemand.upsert({
            where: { demandReferenceKey: line.demandReferenceKey },
            create: {
                companyId: line.companyId,
                materialId: line.materialId,
                plantId: line.plantId ?? null,
                warehouseId: line.warehouseId ?? null,
                uomId: line.uomId,
                demandDate: line.requiredDate,
                quantity: new Decimal(line.quantity),
                sourceModule: line.sourceModule,
                sourceDocumentType: line.sourceDocumentType,
                sourceDocumentId: line.sourceDocumentId,
                sourceDocumentLineId: line.sourceDocumentLineId ?? null,
                demandReferenceKey: line.demandReferenceKey,
                priority: line.priority,
                sourceType: line.sourceType ?? demandSourceTypeFromModule(line.sourceModule),
                status: line.status,
                remarks: line.remarks ?? null,
                createdBy: input.createdBy ?? null,
            },
            update: {
                plantId: line.plantId ?? null,
                warehouseId: line.warehouseId ?? null,
                uomId: line.uomId,
                demandDate: line.requiredDate,
                quantity: new Decimal(line.quantity),
                priority: line.priority,
                status: line.status,
                remarks: line.remarks ?? null,
            },
        })
    }

    async upsertMany(inputs: MmDemandSyncInput[]) {
        const rows = []
        for (const input of inputs) {
            rows.push(await this.upsertLine(input))
        }
        return rows
    }

    async cancelBySourceDocument(
        sourceModule: string,
        sourceDocumentType: string,
        sourceDocumentId: string,
    ) {
        return this.prisma.mmPlanningDemand.updateMany({
            where: {
                sourceModule,
                sourceDocumentType,
                sourceDocumentId,
                status: 'OPEN',
            },
            data: { status: 'CANCELLED' },
        })
    }

    async cancelByReferenceKey(demandReferenceKey: string) {
        const existing = await this.prisma.mmPlanningDemand.findUnique({
            where: { demandReferenceKey },
        })
        if (!existing) return null
        if (existing.status === 'CANCELLED') return existing
        return this.prisma.mmPlanningDemand.update({
            where: { demandReferenceKey },
            data: { status: 'CANCELLED' },
        })
    }

    async syncFromProviderLines(lines: MmNormalizedDemandLine[]) {
        return this.upsertMany(lines)
    }
}
