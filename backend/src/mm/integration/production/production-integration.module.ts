import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../../mm.module'
import { DemandIntegrationModule } from '../demand/demand-integration.module'
import { ProductionIntegrationController } from './production-integration.controller'
import { ProductionIntegrationService } from './production-integration.service'
import { ProductionDemandListener } from './production-demand.listener'
import { ProductionOrderGuardAdapter } from './production-order-guard.adapter'
import { PRODUCTION_ORDER_GUARD_PORT } from './production-order-guard.port'

@Module({
    imports: [DemandIntegrationModule, forwardRef(() => MmModule)],
    controllers: [ProductionIntegrationController],
    providers: [
        ProductionIntegrationService,
        ProductionDemandListener,
        ProductionOrderGuardAdapter,
        { provide: PRODUCTION_ORDER_GUARD_PORT, useExisting: ProductionOrderGuardAdapter },
    ],
    exports: [ProductionIntegrationService],
})
export class ProductionIntegrationModule {}
