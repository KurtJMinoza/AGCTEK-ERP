import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../../mm.module'
import { DemandIntegrationModule } from '../demand/demand-integration.module'
import { SdIntegrationController } from './sd-integration.controller'
import { SdIntegrationService } from './sd-integration.service'
import { SdDemandListener } from './sd-demand.listener'
import { SdOrderGuardAdapter } from './sd-order-guard.adapter'
import { SD_ORDER_GUARD_PORT } from './sd-order-guard.port'

@Module({
    imports: [DemandIntegrationModule, forwardRef(() => MmModule)],
    controllers: [SdIntegrationController],
    providers: [
        SdIntegrationService,
        SdDemandListener,
        SdOrderGuardAdapter,
        { provide: SD_ORDER_GUARD_PORT, useExisting: SdOrderGuardAdapter },
    ],
    exports: [SdIntegrationService],
})
export class SdIntegrationModule {}
