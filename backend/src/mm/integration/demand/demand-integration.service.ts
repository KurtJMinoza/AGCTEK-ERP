import { BadRequestException, Injectable } from '@nestjs/common'
import type { MmDemandQuery } from './mm-demand.types'
import { MmDemandAggregationService } from './mm-demand-aggregation.service'
import { MmDemandRegistryService } from './mm-demand-registry.service'
import { MmDemandSyncService } from './mm-demand-sync.service'
import type {
    CancelDemandBySourceDto,
    SyncDemandBatchDto,
    SyncDemandLineDto,
} from './dto/demand-integration.dto'
import { ALLOWED_SYNC_MODULES } from './dto/demand-integration.dto'

@Injectable()
export class DemandIntegrationService {
    constructor(
        private registry: MmDemandRegistryService,
        private aggregation: MmDemandAggregationService,
        private sync: MmDemandSyncService,
    ) {}

    listRegisteredModules() {
        return this.registry.listRegisteredModules()
    }

    async listOpenDemand(query: {
        companyId: string
        materialIds?: string[]
        warehouseIds?: string[]
        asOf: Date
        horizonEnd: Date
    }) {
        const demandQuery: MmDemandQuery = {
            companyId: query.companyId,
            materialIds: query.materialIds ?? [],
            warehouseIds: query.warehouseIds ?? [],
            asOf: query.asOf,
            horizonEnd: query.horizonEnd,
        }
        return this.registry.listOpenDemand(demandQuery)
    }

    async loadForMrp(query: MmDemandQuery) {
        return this.aggregation.loadForMrp(query)
    }

    assertSyncAllowed(sourceModule: string) {
        if (
            !ALLOWED_SYNC_MODULES.includes(
                sourceModule as (typeof ALLOWED_SYNC_MODULES)[number],
            )
        ) {
            throw new BadRequestException(
                `Module ${sourceModule} must publish demand through its own provider or events; direct sync allowed for: ${ALLOWED_SYNC_MODULES.join(', ')}`,
            )
        }
    }

    async syncLine(dto: SyncDemandLineDto) {
        this.assertSyncAllowed(dto.sourceModule)
        return this.sync.upsertLine({
            ...dto,
            requiredDate: new Date(dto.requiredDate),
            priority: dto.priority ?? 100,
            status: dto.status ?? 'OPEN',
        })
    }

    async syncBatch(dto: SyncDemandBatchDto) {
        for (const line of dto.lines) {
            this.assertSyncAllowed(line.sourceModule)
        }
        return this.sync.upsertMany(
            dto.lines.map((l) => ({
                ...l,
                requiredDate: new Date(l.requiredDate),
                priority: l.priority ?? 100,
                status: l.status ?? 'OPEN',
            })),
        )
    }

    async cancelBySource(dto: CancelDemandBySourceDto) {
        return this.sync.cancelBySourceDocument(
            dto.sourceModule,
            dto.sourceDocumentType,
            dto.sourceDocumentId,
        )
    }
}
