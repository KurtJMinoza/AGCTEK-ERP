import type { Prisma } from '@prisma/client'

/** Prisma delegate name of a model with a `createdAt` column. */
export type ActivityModel = Uncapitalize<Prisma.ModelName>

/**
 * A navigation page whose "new data" is rows of `model` created since the user last opened it.
 * `path` mirrors the frontend registry (`src/configs/erp-modules.ts`); `hub` is the parent submodule
 * page for features nested inside a hub (MM). `permission` is the read permission guarding the page.
 */
export type ActivitySource = {
    module: string
    path: string
    hub?: string
    permission: string
    model: ActivityModel
}

export const MODULE_SEEN_PREFIX = 'module:'
export const BASELINE_SEEN_KEY = '__baseline__'

export const moduleSeenKey = (moduleCode: string) =>
    `${MODULE_SEEN_PREFIX}${moduleCode}`

const page = (
    module: string,
    code: string,
    model: ActivityModel,
    options: { path?: string; permission?: string } = {},
): ActivitySource => ({
    module,
    path: options.path ?? `/modules/${module}/${code}`,
    permission: options.permission ?? `${module}.${code}`,
    model,
})

const mmFeature = (
    hub: string,
    code: string,
    model: ActivityModel,
): ActivitySource => ({
    module: 'mm',
    hub: `/modules/mm/${hub}`,
    path: `/modules/mm/${hub}/${code}`,
    permission: `mm.${hub}.${code}`,
    model,
})

const scm = (code: string, model: ActivityModel) =>
    page('scm', code, model, { path: `/scm/${code}` })

const crm = (code: string, model: ActivityModel) =>
    page('crm', code, model, { path: `/crm/${code}` })

/** Each model appears at most once per module so module totals never double count. */
export const ACTIVITY_SOURCES: readonly ActivitySource[] = [
    page('sd', 'customer-master', 'sdCustomer'),
    page('sd', 'product-catalog', 'sdProduct'),
    page('sd', 'material-sales-view', 'sdProductMaterialAssignment'),
    page('sd', 'sales-orders', 'sdSalesOrder'),
    page('sd', 'deliveries', 'sdShipment'),
    page('sd', 'sales-returns', 'sdSalesReturn'),
    page('sd', 'customer-returns', 'sdReturnRequest', {
        permission: 'sd.sales-returns',
    }),
    page('sd', 'billing', 'sdSalesInvoice'),

    mmFeature('organization', 'companies', 'company'),
    mmFeature('organization', 'branches', 'branch'),
    mmFeature('material-master', 'materials-skus', 'mmMaterial'),
    mmFeature('material-master', 'material-types', 'mmMaterialType'),
    mmFeature('material-master', 'material-categories', 'mmMaterialCategory'),
    mmFeature('material-master', 'units-of-measure', 'mmUom'),
    mmFeature('material-master', 'uom-conversions', 'mmUomConversion'),
    mmFeature('material-master', 'barcodes', 'mmBarcode'),
    mmFeature('material-master', 'batches', 'mmBatch'),
    mmFeature('material-master', 'serial-numbers', 'mmSerialNumber'),
    mmFeature('supplier-management', 'supplier-master', 'mmSupplier'),
    mmFeature('supplier-management', 'supplier-categories', 'mmSupplierCategory'),
    mmFeature('supplier-management', 'supplier-materials', 'mmSupplierMaterial'),
    mmFeature('supplier-management', 'supplier-pricing', 'mmSupplierPrice'),
    mmFeature('supplier-management', 'payment-terms', 'mmPaymentTerms'),
    mmFeature('supplier-management', 'supplier-evaluation', 'mmSupplierEvaluation'),
    mmFeature('procurement', 'purchase-requisitions', 'mmPurchaseRequisition'),
    mmFeature('procurement', 'rfqs', 'mmRfq'),
    mmFeature('procurement', 'supplier-quotations', 'mmSupplierQuotation'),
    mmFeature('procurement', 'purchase-orders', 'mmPurchaseOrder'),
    mmFeature('procurement', 'supplier-invoices', 'mmSupplierInvoice'),
    mmFeature('procurement', 'match-exceptions', 'mmMatchException'),
    mmFeature('procurement', 'purchase-contracts', 'mmPurchaseContract'),
    mmFeature('receiving', 'expected-receipts', 'mmExpectedReceipt'),
    mmFeature('receiving', 'advanced-shipping-notices', 'mmAsn'),
    mmFeature('receiving', 'goods-receipt', 'mmGoodsReceipt'),
    mmFeature('receiving', 'inspection-queue', 'mmInspectionLot'),
    mmFeature('receiving', 'inspection-plans', 'mmInspectionPlan'),
    mmFeature('receiving', 'inspection-rules', 'mmQualityInspectionRule'),
    mmFeature('receiving', 'defect-codes', 'mmDefectCode'),
    mmFeature('receiving', 'nonconformances', 'mmNonconformance'),
    mmFeature('inventory-management', 'reservations', 'mmInventoryReservationHeader'),
    mmFeature('inventory-management', 'stock-movements', 'mmInventoryTransaction'),
    mmFeature('inventory-management', 'goods-issue', 'mmGoodsIssue'),
    mmFeature('inventory-management', 'stock-transfers', 'mmStockTransferOrder'),
    mmFeature('inventory-management', 'inventory-adjustments', 'mmInventoryAdjustment'),
    mmFeature('warehouse-management', 'task-queue', 'wmWarehouseTask'),
    mmFeature('warehouse-management', 'exceptions', 'wmWarehouseTaskException'),
    mmFeature('warehouse-management', 'warehouses', 'warehouse'),
    mmFeature('warehouse-management', 'storage-types', 'wmStorageType'),
    mmFeature('warehouse-management', 'storage-sections', 'wmStorageSection'),
    mmFeature('warehouse-management', 'storage-shelves', 'wmStorageShelf'),
    mmFeature('warehouse-management', 'storage-bins', 'wmStorageBin'),
    mmFeature('warehouse-management', 'picking', 'wmPickingTask'),
    mmFeature('warehouse-management', 'packing', 'wmPackingSession'),
    mmFeature('warehouse-management', 'transfer-orders', 'mmWarehouseTransferOrder'),
    mmFeature('warehouse-management', 'in-transit', 'mmTransferShipment'),
    mmFeature('warehouse-management', 'transfer-receipts', 'mmTransferReceipt'),
    mmFeature('warehouse-management', 'warehouse-transfers', 'wmWarehouseTransfer'),
    mmFeature('inventory-control', 'count-planning', 'mmCountPlan'),
    mmFeature('inventory-control', 'count-sessions', 'mmCountSession'),
    mmFeature('inventory-control', 'recounts', 'mmCountRecount'),
    mmFeature('inventory-control', 'variance-analysis', 'mmCountVariance'),
    mmFeature('inventory-control', 'adjustment-approval', 'mmCountAdjustmentRequest'),
    mmFeature('planning-mrp', 'demand', 'mmPlanningDemand'),
    mmFeature('planning-mrp', 'mrp-runs', 'mmMrpRun'),
    mmFeature('planning-mrp', 'material-requirements', 'mmMaterialRequirement'),
    mmFeature('planning-mrp', 'reorder-point', 'mmReorderRule'),
    mmFeature('planning-mrp', 'procurement-suggestions', 'mmProcurementSuggestion'),
    mmFeature('valuation', 'cost-layers', 'mmCostLayer'),
    mmFeature('valuation', 'standard-cost', 'mmStandardCostRevision'),
    mmFeature('valuation', 'landed-cost', 'mmLandedCost'),
    mmFeature('valuation', 'price-variance', 'mmPriceVariance'),
    mmFeature('returns-disposal', 'supplier-returns', 'mmSupplierReturn'),
    mmFeature('returns-disposal', 'customer-return-intake', 'mmCustomerReturnIntake'),
    mmFeature('returns-disposal', 'scrap', 'mmScrapTransaction'),
    mmFeature('returns-disposal', 'disposal', 'mmDisposal'),

    page('fico', 'journal-entries', 'ficoJournalEntry'),

    crm('leads', 'crmLead'),
    crm('opportunities', 'crmOpportunity'),
    crm('tickets', 'crmTicket'),

    scm('demand-planning', 'demandPlanVersion'),
    scm('shipments', 'shipment'),
    scm('load-building', 'loadPlan'),
    scm('trips', 'trip'),
    scm('vehicles', 'vehicle'),
    scm('drivers', 'driver'),
    scm('maintenance', 'maintenanceRecord'),
]

/** Keys a user may mark as seen: module codes, page paths and hub paths. */
export const SEEN_KEYS: ReadonlySet<string> = new Set([
    ...ACTIVITY_SOURCES.map((s) => moduleSeenKey(s.module)),
    ...ACTIVITY_SOURCES.map((s) => s.path),
    ...ACTIVITY_SOURCES.flatMap((s) => (s.hub ? [s.hub] : [])),
])
