import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { MmCommonModule } from './common/mm-common.module'
import { ProcurementCommonModule } from './procurement/procurement-common.module'
import { MaterialsController } from './materials/materials.controller'
import { MaterialsService } from './materials/materials.service'
import { MaterialTypesController } from './material-types/material-types.controller'
import { MaterialTypesService } from './material-types/material-types.service'
import { MaterialCategoriesController } from './material-categories/material-categories.controller'
import { MaterialCategoriesService } from './material-categories/material-categories.service'
import { UomController } from './uom/uom.controller'
import { UomService } from './uom/uom.service'
import { UomConversionsController } from './uom-conversions/uom-conversions.controller'
import { UomConversionsService } from './uom-conversions/uom-conversions.service'
import { BarcodesController } from './barcodes/barcodes.controller'
import { BarcodesService } from './barcodes/barcodes.service'
import { BatchesController } from './batches/batches.controller'
import { BatchesService } from './batches/batches.service'
import { SerialNumbersController } from './serial-numbers/serial-numbers.controller'
import { SerialNumbersService } from './serial-numbers/serial-numbers.service'
import { OrgController } from './org.controller'
import { OrgService } from './org.service'
import { WarehouseController } from './warehouse/warehouse.controller'
import { WarehouseService } from './warehouse/warehouse.service'
import { StorageTypesController } from './warehouse/storage-types.controller'
import { StorageTypesService } from './warehouse/storage-types.service'
import { StorageSectionsController } from './warehouse/storage-sections.controller'
import { StorageSectionsService } from './warehouse/storage-sections.service'
import { StorageBinsController } from './warehouse/storage-bins.controller'
import { StorageBinsService } from './warehouse/storage-bins.service'
import { InventoryBalanceController } from './warehouse/inventory-balance/inventory-balance.controller'
import { InventoryBalanceService } from './warehouse/inventory-balance/inventory-balance.service'
import { PutawayController } from './warehouse/putaway/putaway.controller'
import { PutawayService } from './warehouse/putaway/putaway.service'
import { PickingController } from './warehouse/picking/picking.controller'
import { PickingService } from './warehouse/picking/picking.service'
import { PickWaveController } from './warehouse/picking/pick-wave.controller'
import { PickWaveService } from './warehouse/picking/pick-wave.service'
import { PackingController } from './warehouse/packing/packing.controller'
import { PackingSessionController } from './warehouse/packing/packing-session.controller'
import { PackingService } from './warehouse/packing/packing.service'
import { TransfersController } from './warehouse/transfers/transfers.controller'
import { TransfersService } from './warehouse/transfers/transfers.service'
import { InventoryController } from './inventory/inventory.controller'
import { InventoryPostingService } from './inventory/inventory-posting.service'
import { InventoryBalanceQueryService } from './inventory/inventory-balance-query.service'
import { MmInventoryBalanceService } from './inventory/inventory-balance.service'
import { InventoryAvailabilityService } from './inventory/inventory-availability.service'
import { InventoryOperationService } from './inventory/inventory-operation.service'
import { InventoryReversalService } from './inventory/inventory-reversal.service'
import { InventoryTraceabilityService } from './inventory/inventory-traceability.service'
import { InventoryReservationService } from './inventory/inventory-reservation.service'
import { StockStatusService } from './inventory/stock-status.service'
import { InventoryEventsService } from './inventory/inventory-events.service'
import { GoodsReceiptController } from './stock-ops/goods-receipt.controller'
import { GoodsReceiptService } from './stock-ops/goods-receipt.service'
import { GoodsIssueController } from './stock-ops/goods-issue.controller'
import { GoodsIssueService } from './stock-ops/goods-issue.service'
import { BinTransferController } from './stock-ops/bin-transfer.controller'
import { BinTransferService } from './stock-ops/bin-transfer.service'
import { WarehouseTransferOrderController } from './stock-ops/warehouse-transfer-order.controller'
import { WarehouseTransferOrderService } from './stock-ops/warehouse-transfer-order.service'
import { AdjustmentController } from './stock-ops/adjustment.controller'
import { AdjustmentService } from './stock-ops/adjustment.service'
import { SupplierController } from './supplier/supplier.controller'
import { SupplierService } from './supplier/supplier.service'
import { SupplierBankController } from './supplier/supplier-bank.controller'
import { SupplierBankService } from './supplier/supplier-bank.service'
import { SupplierMaterialController } from './supplier/supplier-material.controller'
import { SupplierMaterialService } from './supplier/supplier-material.service'
import { SupplierPricingController } from './supplier/supplier-pricing.controller'
import { SupplierPricingService } from './supplier/supplier-pricing.service'
import { PaymentTermsController } from './supplier/payment-terms.controller'
import { PaymentTermsService } from './supplier/payment-terms.service'
import { SupplierCategoryController } from './supplier/supplier-category.controller'
import { SupplierCategoryService } from './supplier/supplier-category.service'
import { WorkflowController } from './workflow/workflow.controller'
import { WorkflowService } from './workflow/workflow.service'
import { PurchaseRequisitionController } from './purchase-requisition/purchase-requisition.controller'
import { PurchaseRequisitionService } from './purchase-requisition/purchase-requisition.service'
import { RfqController } from './rfq/rfq.controller'
import { RfqService } from './rfq/rfq.service'
import { QuotationController } from './rfq/quotation.controller'
import { QuotationComparisonController } from './rfq/quotation-comparison.controller'
import { QuotationService } from './rfq/quotation.service'
import { PurchaseOrderController, PoToleranceController } from './purchase-order/purchase-order.controller'
import { PurchaseOrderService } from './purchase-order/purchase-order.service'
import { InboundController } from './inbound/inbound.controller'
import { ExpectedReceiptService } from './inbound/expected-receipt.service'
import { ReceivingService } from './inbound/receiving.service'
import { QualityInspectionService } from './inbound/quality-inspection.service'
import { ReservationController } from './outbound/reservation.controller'
import { ReservationService } from './outbound/reservation.service'
import { InventoryControlController } from './inventory-control/inventory-control.controller'
import { CountRuleService } from './inventory-control/count-rule.service'
import { InventoryCountService } from './inventory-control/inventory-count.service'
import { CountPolicyService } from './inventory-control/count-policy.service'
import { CountPlanService } from './inventory-control/count-plan.service'
import { CountSessionService } from './inventory-control/count-session.service'
import { CountTaskService } from './inventory-control/count-task.service'
import { CountEntryService } from './inventory-control/count-entry.service'
import { CountVarianceService } from './inventory-control/count-variance.service'
import { CountRecountService } from './inventory-control/count-recount.service'
import { CountAdjustmentRequestService } from './inventory-control/count-adjustment-request.service'
import { CountGenerationService } from './inventory-control/count-generation.service'
import { ValuationController } from './valuation/valuation.controller'
import { MaterialValuationService } from './valuation/material-valuation.service'
import { CostLayerService } from './valuation/cost-layer.service'
import { ValuationEngineService } from './valuation/valuation-engine.service'
import { InventoryValueService } from './valuation/inventory-value.service'
import { LandedCostService } from './valuation/landed-cost.service'
import { CostElementService } from './valuation/cost-element.service'
import { PriceVarianceService } from './valuation/price-variance.service'
import { FifoValuationStrategy } from './valuation/strategies/fifo-valuation.strategy'
import { MovingAverageValuationStrategy } from './valuation/strategies/moving-average-valuation.strategy'
import { StandardCostValuationStrategy } from './valuation/strategies/standard-cost-valuation.strategy'
import { ValuationMethodRegistry } from './valuation/strategies/valuation-method.registry'
import { ThreeWayMatchController } from './three-way-match/three-way-match.controller'
import { SupplierInvoiceService } from './three-way-match/supplier-invoice.service'
import { ThreeWayMatchService } from './three-way-match/three-way-match.service'
import { MatchExceptionService } from './three-way-match/match-exception.service'
import { MatchToleranceService } from './three-way-match/match-tolerance.service'
import { PlanningController } from './planning/planning.controller'
import { ReorderRuleService } from './planning/reorder-rule.service'
import { PlanningDemandService } from './planning/planning-demand.service'
import { MrpEngineService } from './planning/mrp-engine.service'
import { MrpRunService } from './planning/mrp-run.service'
import { ProcurementSuggestionService } from './planning/procurement-suggestion.service'
import { PlanningDashboardService } from './planning/planning-dashboard.service'
import { BOM_PROVIDER, NullBomProvider } from './planning/bom-provider'
import { SupplierPerformanceController } from './supplier-performance/supplier-performance.controller'
import { SupplierScoreConfigService } from './supplier-performance/supplier-score-config.service'
import { SupplierEvaluationService } from './supplier-performance/supplier-evaluation.service'
import { SupplierAlertService } from './supplier-performance/supplier-alert.service'
import { SupplierPerformanceDashboardService } from './supplier-performance/supplier-performance-dashboard.service'
import { SupplierManualAssessmentService } from './supplier-performance/supplier-manual-assessment.service'
import { ReturnsDisposalController } from './returns-disposal/returns-disposal.controller'
import { ReturnsController } from './returns-disposal/returns.controller'
import { DisposalsController } from './returns-disposal/disposals.controller'
import { ReturnsDisposalConfigService } from './returns-disposal/returns-disposal-config.service'
import { SupplierReturnService } from './returns-disposal/supplier-return.service'
import { DisposalService } from './returns-disposal/disposal.service'
import { CustomerReturnService } from './returns-disposal/customer-return.service'
import { ExpiryControlService } from './returns-disposal/expiry-control.service'
import { TraceabilityController } from './traceability/traceability.controller'
import { TraceabilityService } from './traceability/traceability.service'
import { DamagedExpiredQueryService } from './returns-disposal/damaged-expired-query.service'
import { ScannerController } from './scanner/scanner.controller'
import { BarcodeResolveService } from './scanner/barcode-resolve.service'
import { ScannerEventService } from './scanner/scanner-event.service'
import { MobileDeviceService } from './scanner/mobile-device.service'
import { MobileExecutionService } from './scanner/mobile-execution.service'
import {
    MobileController,
    ScannerResolvePostController,
} from './scanner/mobile.controller'
import { DashboardController } from './dashboard/dashboard.controller'
import { ReportsController } from './reports/reports.controller'
import { AnalyticsController } from './analytics/analytics.controller'
import { AnalyticsService } from './analytics/analytics.service'
import { ReportsService } from './reports/reports.service'
import { StockVarianceReportService } from './reports/stock-variance-report.service'
import { WarehousePerformanceReportService } from './reports/warehouse-performance-report.service'
import { DashboardKpiService } from './dashboard/dashboard-kpi.service'
import { DashboardAlertService } from './dashboard/dashboard-alert.service'
import { DashboardAnalyticsService } from './dashboard/dashboard-analytics.service'
import { DashboardVisibilityService } from './dashboard/dashboard-visibility.service'
import { PurchaseContractController } from './purchase-contract/purchase-contract.controller'
import { PurchaseContractService } from './purchase-contract/purchase-contract.service'
import { ProcurementHistoryController } from './procurement-history/procurement-history.controller'
import { ProcurementHistoryService } from './procurement-history/procurement-history.service'
import { ReceivingController } from './receiving/receiving.controller'
import { InspectionLotController } from './receiving/inspection-lot.controller'
import { QualityHoldController } from './receiving/quality-hold.controller'
import { ReceivingDocumentService } from './receiving/receiving-document.service'
import { ReceivingVarianceService } from './receiving/receiving-variance.service'
import { InspectionRequirementService } from './receiving/inspection-requirement.service'
import { InspectionLotService } from './receiving/inspection-lot.service'
import { QualityDecisionService } from './receiving/quality-decision.service'
import { QualityHoldService } from './receiving/quality-hold.service'
import { WarehouseTaskController } from './warehouse/tasks/warehouse-task.controller'
import { WarehouseTaskService } from './warehouse/tasks/warehouse-task.service'
import { TaskAssignmentService } from './warehouse/tasks/task-assignment.service'
import { WarehouseExceptionService } from './warehouse/tasks/warehouse-exception.service'
import { PutawayStrategyRegistry } from './warehouse/tasks/strategies/putaway-strategy.registry'
import { CapacityBasedPutawayStrategy } from './warehouse/tasks/strategies/capacity-based-putaway.strategy'
import { PickingStrategyRegistry, FifoPickingStrategy } from './warehouse/tasks/strategies/picking-strategy.registry'
import { PutawayCompletionHandler } from './warehouse/tasks/task-completion/putaway-completion.handler'
import { PickCompletionHandler } from './warehouse/tasks/task-completion/pick-completion.handler'
import { RelocationCompletionHandler } from './warehouse/tasks/task-completion/relocation-completion.handler'
import { TransferCompletionHandler } from './warehouse/tasks/task-completion/transfer-completion.handler'
import { PutawayRequestedListener } from './warehouse/tasks/putaway-requested.listener'
import { ReservationAllocationController } from './inventory/reservation-allocation/reservation-allocation.controller'
import { ReservationEngineService } from './inventory/reservation-allocation/reservation-engine.service'
import { AllocationEngineService } from './inventory/reservation-allocation/allocation-engine.service'
import { AllocationStrategyRegistry } from './inventory/reservation-allocation/strategies/allocation-strategy.registry'
import { FifoAllocationStrategy } from './inventory/reservation-allocation/strategies/fifo-allocation.strategy'
import { FefoAllocationStrategy } from './inventory/reservation-allocation/strategies/fefo-allocation.strategy'
import { DemandReservationAdapter } from './inventory/reservation-allocation/demand-reservation.adapter'
import { DEMAND_RESERVATION_PORT } from './inventory/reservation-allocation/demand-reservation.interface'
import { StockTransferOrderController } from './stock-transfer/stock-transfer-order.controller'
import { StockTransferOrderService } from './stock-transfer/stock-transfer-order.service'
import { StockTransferValidationService } from './stock-transfer/stock-transfer-validation.service'
import { StockTransferAllocationService } from './stock-transfer/stock-transfer-allocation.service'
import { StockTransferShipmentService } from './stock-transfer/stock-transfer-shipment.service'
import { StockTransferReceiptService } from './stock-transfer/stock-transfer-receipt.service'
import { StockTransferWarehouseBridgeService } from './stock-transfer/stock-transfer-warehouse-bridge.service'

@Module({
    imports: [NotificationsModule, MmCommonModule, ProcurementCommonModule],
    controllers: [
        MaterialsController,
        MaterialTypesController,
        MaterialCategoriesController,
        UomController,
        UomConversionsController,
        BarcodesController,
        BatchesController,
        SerialNumbersController,
        OrgController,
        WarehouseController,
        StorageTypesController,
        StorageSectionsController,
        StorageBinsController,
        InventoryBalanceController,
        PutawayController,
        PickingController,
        PickWaveController,
        PackingController,
        PackingSessionController,
        WarehouseTaskController,
        TransfersController,
        InventoryController,
        ReservationAllocationController,
        GoodsReceiptController,
        GoodsIssueController,
        BinTransferController,
        WarehouseTransferOrderController,
        StockTransferOrderController,
        AdjustmentController,
        SupplierController,
        SupplierBankController,
        SupplierMaterialController,
        SupplierPricingController,
        PaymentTermsController,
        SupplierCategoryController,
        WorkflowController,
        PurchaseRequisitionController,
        RfqController,
        QuotationController,
        QuotationComparisonController,
        PurchaseOrderController,
        PoToleranceController,
        PurchaseContractController,
        ProcurementHistoryController,
        InboundController,
        ReceivingController,
        InspectionLotController,
        QualityHoldController,
        ReservationController,
        InventoryControlController,
        ValuationController,
        ThreeWayMatchController,
        PlanningController,
        SupplierPerformanceController,
        ReturnsDisposalController,
        ReturnsController,
        DisposalsController,
        TraceabilityController,
        ScannerController,
        MobileController,
        ScannerResolvePostController,
        DashboardController,
        ReportsController,
        AnalyticsController,
    ],
    providers: [
        MaterialsService,
        MaterialTypesService,
        MaterialCategoriesService,
        UomService,
        UomConversionsService,
        BarcodesService,
        BatchesService,
        SerialNumbersService,
        OrgService,
        WarehouseService,
        StorageTypesService,
        StorageSectionsService,
        StorageBinsService,
        InventoryBalanceService,
        PutawayService,
        PickingService,
        PickWaveService,
        PackingService,
        WarehouseTaskService,
        TaskAssignmentService,
        WarehouseExceptionService,
        PutawayStrategyRegistry,
        CapacityBasedPutawayStrategy,
        PickingStrategyRegistry,
        FifoPickingStrategy,
        PutawayCompletionHandler,
        PickCompletionHandler,
        RelocationCompletionHandler,
        TransferCompletionHandler,
        PutawayRequestedListener,
        TransfersService,
        StockTransferOrderService,
        StockTransferValidationService,
        StockTransferAllocationService,
        StockTransferShipmentService,
        StockTransferReceiptService,
        StockTransferWarehouseBridgeService,
        InventoryPostingService,
        InventoryBalanceQueryService,
        MmInventoryBalanceService,
        InventoryAvailabilityService,
        InventoryOperationService,
        InventoryReversalService,
        InventoryTraceabilityService,
        InventoryReservationService,
        ReservationEngineService,
        AllocationEngineService,
        AllocationStrategyRegistry,
        FifoAllocationStrategy,
        FefoAllocationStrategy,
        DemandReservationAdapter,
        { provide: DEMAND_RESERVATION_PORT, useExisting: DemandReservationAdapter },
        StockStatusService,
        InventoryEventsService,
        GoodsReceiptService,
        GoodsIssueService,
        BinTransferService,
        WarehouseTransferOrderService,
        AdjustmentService,
        SupplierService,
        SupplierBankService,
        SupplierMaterialService,
        SupplierPricingService,
        PaymentTermsService,
        SupplierCategoryService,
        WorkflowService,
        PurchaseRequisitionService,
        RfqService,
        QuotationService,
        PurchaseOrderService,
        PurchaseContractService,
        ProcurementHistoryService,
        ExpectedReceiptService,
        ReceivingService,
        QualityInspectionService,
        ReceivingDocumentService,
        ReceivingVarianceService,
        InspectionRequirementService,
        InspectionLotService,
        QualityDecisionService,
        QualityHoldService,
        ReservationService,
        InventoryAvailabilityService,
        CountRuleService,
        InventoryCountService,
        CountPolicyService,
        CountPlanService,
        CountSessionService,
        CountTaskService,
        CountEntryService,
        CountVarianceService,
        CountRecountService,
        CountAdjustmentRequestService,
        CountGenerationService,
        MaterialValuationService,
        CostLayerService,
        ValuationEngineService,
        InventoryValueService,
        LandedCostService,
        CostElementService,
        PriceVarianceService,
        FifoValuationStrategy,
        MovingAverageValuationStrategy,
        StandardCostValuationStrategy,
        ValuationMethodRegistry,
        SupplierInvoiceService,
        ThreeWayMatchService,
        MatchExceptionService,
        MatchToleranceService,
        ReorderRuleService,
        PlanningDemandService,
        MrpEngineService,
        MrpRunService,
        ProcurementSuggestionService,
        PlanningDashboardService,
        { provide: BOM_PROVIDER, useClass: NullBomProvider },
        SupplierScoreConfigService,
        SupplierAlertService,
        SupplierEvaluationService,
        SupplierPerformanceDashboardService,
        SupplierManualAssessmentService,
        ReturnsDisposalConfigService,
        SupplierReturnService,
        DisposalService,
        CustomerReturnService,
        DamagedExpiredQueryService,
        ExpiryControlService,
        TraceabilityService,
        BarcodeResolveService,
        ScannerEventService,
        MobileDeviceService,
        MobileExecutionService,
        DashboardKpiService,
        DashboardAlertService,
        DashboardAnalyticsService,
        DashboardVisibilityService,
        ReportsService,
        StockVarianceReportService,
        WarehousePerformanceReportService,
        AnalyticsService,
    ],
})
export class MmModule {}
