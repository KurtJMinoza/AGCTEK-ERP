import { Module, forwardRef } from '@nestjs/common'
import { MmModule } from '../mm/mm.module'
import { ScmModule } from '../scm/scm.module'
import { RetailModule } from '../retail/retail.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CustomerController } from './customer.controller'
import { CustomerService } from './customer.service'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'
import { SalesOrderController } from './sales-order.controller'
import { OrderTrackingService } from './order-tracking.service'
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
import { OrderTrackingNotifierListener } from './order-tracking-notifier.listener'
import { ReturnRequestService } from './return-request.service'
import { ReturnRequestController } from './return-request.controller'
import { ReviewModule } from './reviews/review.module'
import { DeliveryController } from './delivery.controller'
import { DeliveryMonitorService } from './delivery-monitor.service'
import { SalesInvoiceController } from './sales-invoice.controller'
import { SalesInvoicePdfService } from './sales-invoice-pdf.service'
import { ProductFamilyService } from './product-family.service'
import { ProductVariantService } from './product-variant.service'
import { ProductMaterialLinkService } from './product-material-link.service'
import { PricingConditionController } from './pricing-condition.controller'
import { PricingConditionService } from './pricing-condition.service'
import { SalesAnalyticsController } from './sales-analytics.controller'
import { UploadsController } from './uploads.controller'
import { SalesAnalyticsService } from './sales-analytics.service'
import { BackorderReportController } from './backorder-report.controller'
import { BackorderReportService } from './backorder-report.service'

@Module({
    imports: [
        forwardRef(() => MmModule),
        forwardRef(() => ScmModule),
        RetailModule,
        NotificationsModule,
        ReviewModule,
    ],
    controllers: [
        SalesOrderController,
        CustomerController,
        ProductController,
        ProductMaterialAssignmentController,
        SdMaterialReferenceController,
        QuotationController,
        SalesReturnController,
        ReturnRequestController,
        DeliveryController,
        SalesInvoiceController,
        PricingConditionController,
        SalesAnalyticsController,
        UploadsController,
        BackorderReportController,
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
        DeliveryMonitorService,
        SalesInvoicePdfService,
        OrderTrackingService,
        OrderTrackingNotifierListener,
        ProductFamilyService,
        ProductVariantService,
        ProductMaterialLinkService,
        PricingConditionService,
        SalesAnalyticsService,
        BackorderReportService,
    ],
    exports: [
        SalesOrderService,
        SdEventEmitterService,
        SdMmPipelineService,
        CustomerService,
        QuotationService,
        SalesReturnService,
        ReturnRequestService,
        ReviewModule,
    ],
})
export class SdModule {}
