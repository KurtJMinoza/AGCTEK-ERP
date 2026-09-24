import { Module } from '@nestjs/common'
import { MM_DEMAND_PROVIDERS } from './mm-demand-provider.port'
import { MmDemandAggregationService } from './mm-demand-aggregation.service'
import { MmDemandRegistryService } from './mm-demand-registry.service'
import { MmDemandSyncService } from './mm-demand-sync.service'
import { DemandIntegrationController } from './demand-integration.controller'
import { DemandIntegrationService } from './demand-integration.service'
import { SdDemandProvider } from './providers/sd-demand.provider'
import { ProductionDemandProvider } from './providers/production-demand.provider'
import { MaintenanceDemandProvider } from './providers/maintenance-demand.provider'
import { ProjectsDemandProvider } from './providers/projects-demand.provider'

const demandProviders = [
    SdDemandProvider,
    ProductionDemandProvider,
    MaintenanceDemandProvider,
    ProjectsDemandProvider,
]

@Module({
    controllers: [DemandIntegrationController],
    providers: [
        ...demandProviders,
        {
            provide: MM_DEMAND_PROVIDERS,
            useFactory: (
                sd: SdDemandProvider,
                pp: ProductionDemandProvider,
                maint: MaintenanceDemandProvider,
                proj: ProjectsDemandProvider,
            ) => [sd, pp, maint, proj],
            inject: demandProviders,
        },
        MmDemandRegistryService,
        MmDemandSyncService,
        MmDemandAggregationService,
        DemandIntegrationService,
    ],
    exports: [
        MmDemandRegistryService,
        MmDemandSyncService,
        MmDemandAggregationService,
        DemandIntegrationService,
        MM_DEMAND_PROVIDERS,
    ],
})
export class DemandIntegrationModule {}
