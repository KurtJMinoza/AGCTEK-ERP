import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../mm/mm.module'
import { ProductionOrderController } from './production-order.controller'
import { ProductionOrderService } from './production-order.service'
import { BomService } from './bom.service'
import { ProductionBomProvider } from './production-bom.provider'
import { PpEventEmitterService } from './pp-event-emitter.service'
import { PpMmEventConsumer } from './pp-mm-event.consumer'
import { PpMmOrchestrationService } from './pp-mm-orchestration.service'

@Module({
    imports: [forwardRef(() => MmModule)],
    controllers: [ProductionOrderController],
    providers: [
        ProductionOrderService,
        BomService,
        ProductionBomProvider,
        PpEventEmitterService,
        PpMmEventConsumer,
        PpMmOrchestrationService,
    ],
    exports: [
        ProductionOrderService,
        BomService,
        ProductionBomProvider,
        PpEventEmitterService,
    ],
})
export class PpModule {}
