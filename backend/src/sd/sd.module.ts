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
import { ProductMaterialAssignmentService } from './product-material-assignment.service'
import { ProductMaterialAssignmentController } from './product-material-assignment.controller'
import { MaterialResolutionService } from './material-resolution.service'
import { FulfillmentDeterminationService } from './fulfillment-determination.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { SdFulfillmentService } from './sd-fulfillment.service'
import { SdMmPipelineService } from './sd-mm-pipeline.service'
import { SdMaterialReferenceService } from './sd-material-reference.service'
import { SdMaterialReferenceController } from './sd-material-reference.controller'

@Module({
    imports: [forwardRef(() => MmModule), RetailModule],
    controllers: [
        SalesOrderController,
        CustomerController,
        ProductController,
        ProductMaterialAssignmentController,
        SdMaterialReferenceController,
    ],
    providers: [
        CustomerService,
        ProductService,
        SalesOrderService,
        SdEventEmitterService,
        SdMmEventConsumer,
        SdMmOrchestrationService,
        ProductMaterialAssignmentService,
        MaterialResolutionService,
        FulfillmentDeterminationService,
        CommercialAvailabilityService,
        SdFulfillmentService,
        SdMmPipelineService,
        SdMaterialReferenceService,
    ],
    exports: [SalesOrderService, SdEventEmitterService, SdMmPipelineService],
})
export class SdModule {}
