import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../mm/mm.module'
import { SalesOrderController } from './sales-order.controller'
import { SalesOrderService } from './sales-order.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SdMmEventConsumer } from './sd-mm-event.consumer'
import { SdMmOrchestrationService } from './sd-mm-orchestration.service'

@Module({
    imports: [forwardRef(() => MmModule)],
    controllers: [SalesOrderController],
    providers: [
        SalesOrderService,
        SdEventEmitterService,
        SdMmEventConsumer,
        SdMmOrchestrationService,
    ],
    exports: [SalesOrderService, SdEventEmitterService],
})
export class SdModule {}
