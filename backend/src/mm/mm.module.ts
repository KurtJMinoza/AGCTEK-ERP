import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
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
import { PackingService } from './warehouse/packing/packing.service'
import { TransfersController } from './warehouse/transfers/transfers.controller'
import { TransfersService } from './warehouse/transfers/transfers.service'
import { InventoryController } from './inventory/inventory.controller'
import { InventoryPostingService } from './inventory/inventory-posting.service'
import { InventoryBalanceQueryService } from './inventory/inventory-balance-query.service'
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
import { QuotationService } from './rfq/quotation.service'
import { PurchaseOrderController, PoToleranceController } from './purchase-order/purchase-order.controller'
import { PurchaseOrderService } from './purchase-order/purchase-order.service'
import { InboundController } from './inbound/inbound.controller'
import { ExpectedReceiptService } from './inbound/expected-receipt.service'
import { ReceivingService } from './inbound/receiving.service'
import { QualityInspectionService } from './inbound/quality-inspection.service'
import { ReservationController } from './outbound/reservation.controller'
import { ReservationService } from './outbound/reservation.service'
import { InventoryAvailabilityService } from './outbound/inventory-availability.service'
import { InventoryControlController } from './inventory-control/inventory-control.controller'
import { CountRuleService } from './inventory-control/count-rule.service'
import { InventoryCountService } from './inventory-control/inventory-count.service'
import { ValuationController } from './valuation/valuation.controller'
import { MaterialValuationService } from './valuation/material-valuation.service'
import { CostLayerService } from './valuation/cost-layer.service'
import { ValuationEngineService } from './valuation/valuation-engine.service'
import { InventoryValueService } from './valuation/inventory-value.service'
import { LandedCostService } from './valuation/landed-cost.service'
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
import { SupplierPerformanceController } from './supplier-performance/supplier-performance.controller'
import { SupplierScoreConfigService } from './supplier-performance/supplier-score-config.service'
import { SupplierEvaluationService } from './supplier-performance/supplier-evaluation.service'
import { SupplierAlertService } from './supplier-performance/supplier-alert.service'
import { SupplierPerformanceDashboardService } from './supplier-performance/supplier-performance-dashboard.service'
import { SupplierManualAssessmentService } from './supplier-performance/supplier-manual-assessment.service'
import { ReturnsDisposalController } from './returns-disposal/returns-disposal.controller'
import { ReturnsDisposalConfigService } from './returns-disposal/returns-disposal-config.service'
import { SupplierReturnService } from './returns-disposal/supplier-return.service'
import { DisposalService } from './returns-disposal/disposal.service'
import { CustomerReturnService } from './returns-disposal/customer-return.service'
import { DamagedExpiredQueryService } from './returns-disposal/damaged-expired-query.service'
import { ScannerController } from './scanner/scanner.controller'
import { BarcodeResolveService } from './scanner/barcode-resolve.service'
import { ScannerEventService } from './scanner/scanner-event.service'
import { DashboardController } from './dashboard/dashboard.controller'
import { ReportsController } from './reports/reports.controller'
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

@Module({
    imports: [NotificationsModule],
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
        TransfersController,
        InventoryController,
        GoodsReceiptController,
        GoodsIssueController,
        BinTransferController,
        WarehouseTransferOrderController,
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
        PurchaseOrderController,
        PoToleranceController,
        PurchaseContractController,
        ProcurementHistoryController,
        InboundController,
        ReservationController,
        InventoryControlController,
        ValuationController,
        ThreeWayMatchController,
        PlanningController,
        SupplierPerformanceController,
        ReturnsDisposalController,
        ScannerController,
        DashboardController,
        ReportsController,
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
        TransfersService,
        InventoryPostingService,
        InventoryBalanceQueryService,
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
        ReservationService,
        InventoryAvailabilityService,
        CountRuleService,
        InventoryCountService,
        MaterialValuationService,
        CostLayerService,
        ValuationEngineService,
        InventoryValueService,
        LandedCostService,
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
        BarcodeResolveService,
        ScannerEventService,
        DashboardKpiService,
        DashboardAlertService,
        DashboardAnalyticsService,
        DashboardVisibilityService,
        ReportsService,
        StockVarianceReportService,
        WarehousePerformanceReportService,
    ],
})
export class MmModule {}
