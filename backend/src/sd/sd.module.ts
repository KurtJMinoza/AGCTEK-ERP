import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../mm/mm.module'
import { RetailModule } from '../retail/retail.module'
import { CustomerController } from './customer.controller'
import { CustomerService } from './customer.service'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'
import { SalesOrderController } from './sales-order.controller'
import { SalesOrderService } from './sales-order.service'
import { SdEventEmitterService } from './sd-event-emitter.service'
import { SdMmEventConsumer } from './sd-mm-event.consumer'
import { SdMmOrchestrationService } from './sd-mm-orchestration.service'

@Module({
    imports: [forwardRef(() => MmModule), RetailModule],
    controllers: [SalesOrderController, CustomerController, ProductController],
    providers: [
        CustomerService,
        ProductService,
        SalesOrderService,
        SdEventEmitterService,
        SdMmEventConsumer,
        SdMmOrchestrationService,
    ],
    exports: [SalesOrderService, SdEventEmitterService],
})
export class SdModule {}
