import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../mm/mm.module'
import { RetailModule } from '../retail/retail.module'
import { NotificationsModule } from '../notifications/notifications.module'
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
import { ProductOptionVariantsService } from './product-option-variants.service'
import { FulfillmentDeterminationService } from './fulfillment-determination.service'
import { CommercialAvailabilityService } from './commercial-availability.service'
import { SdFulfillmentService } from './sd-fulfillment.service'
import { SdMmPipelineService } from './sd-mm-pipeline.service'
import { SdMaterialReferenceService } from './sd-material-reference.service'
import { SdMaterialReferenceController } from './sd-material-reference.controller'
import { QuotationService } from './quotation.service'
import { QuotationController } from './quotation.controller'
import { QuotationPdfService } from './quotation-pdf.service'
import { SalesReturnService } from './sales-return.service'
import { SalesReturnController } from './sales-return.controller'
import { SalesInvoiceService } from './sales-invoice.service'
import { SdFulfillmentEventsListener } from './sd-fulfillment-events.listener'
import { ReturnRequestService } from './return-request.service'
import { ReturnRequestController } from './return-request.controller'

@Module({
    imports: [forwardRef(() => MmModule), RetailModule, NotificationsModule],
    controllers: [
        SalesOrderController,
        CustomerController,
        ProductController,
        ProductMaterialAssignmentController,
        SdMaterialReferenceController,
        QuotationController,
        SalesReturnController,
        ReturnRequestController,
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
        ProductOptionVariantsService,
        FulfillmentDeterminationService,
        CommercialAvailabilityService,
        SdFulfillmentService,
        SdMmPipelineService,
        SdMaterialReferenceService,
        QuotationService,
        QuotationPdfService,
        SalesReturnService,
        SalesInvoiceService,
        SdFulfillmentEventsListener,
        ReturnRequestService,
    ],
    exports: [
        SalesOrderService,
        SdEventEmitterService,
        SdMmPipelineService,
        CustomerService,
        QuotationService,
        SalesReturnService,
    ],
})
export class SdModule {}
