import { USER_ROLES } from '../auth/auth.constants'

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete'] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

/** `canRead` means the submodule is visible and its records can be read. */
export type CrudFlags = {
    canRead: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
}

export const ACTION_FIELD: Record<PermissionAction, keyof CrudFlags> = {
    read: 'canRead',
    create: 'canCreate',
    update: 'canUpdate',
    delete: 'canDelete',
}

export const MODULE_CODES = {
    SD: 'sd',
    MM: 'mm',
    FICO: 'fico',
    SCM: 'scm',
    CRM: 'crm',
    HCM: 'hcm',
    ADMIN: 'admin',
} as const

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES]

/** Permission groups. */
export const MODULE_CATALOG: {
    code: ModuleCode
    name: string
    description: string
    sortOrder: number
}[] = [
    { code: 'sd', name: 'Sales & Distribution', description: 'Sales orders, POS, pricing, and customer billing.', sortOrder: 10 },
    { code: 'mm', name: 'Materials Management', description: 'Materials, procurement, inventory, and warehousing.', sortOrder: 20 },
    { code: 'fico', name: 'Finance & Controlling', description: 'Accounting, journals, periods, and cost control.', sortOrder: 30 },
    { code: 'scm', name: 'Supply Chain Management', description: 'Fleet, trips, shipments, tracking, and planning.', sortOrder: 40 },
    { code: 'crm', name: 'Customer Relationship Management', description: 'Customers, contacts, and sales pipeline.', sortOrder: 50 },
    { code: 'hcm', name: 'Human Capital Management', description: 'Employees, positions, and HR records.', sortOrder: 60 },
    { code: 'admin', name: 'Administration', description: 'Super Admin Settings: users, roles, and system configuration.', sortOrder: 90 },
]

/** Groups that only super_admin may access; they have no grantable resources. */
export const SUPER_ADMIN_ONLY_MODULES: ReadonlySet<string> = new Set([MODULE_CODES.ADMIN])

export type ResourceDef = {
    code: string
    module: ModuleCode
    name: string
    description: string
    sortOrder: number
    /** Parent submodule code for features nested inside a submodule. */
    parent?: string
}

function group(module: ModuleCode, entries: [code: string, name: string, description: string][]): ResourceDef[] {
    return entries.map(([code, name, description], i) => ({
        code: `${module}.${code}`,
        module,
        name,
        description,
        sortOrder: (i + 1) * 10,
    }))
}

/**
 * Features nested inside MM submodules, keyed by submodule code. Codes mirror the frontend registry
 * (`src/configs/erp-modules/mm.module.ts`). A submodule with features is granted through its features only.
 */
export const MM_FEATURES = {
    organization: [
        ['companies', 'Companies'],
        ['branches', 'Branches'],
    ],
    'material-master': [
        ['materials-skus', 'Materials / SKUs'],
        ['material-types', 'Material Types'],
        ['material-categories', 'Material Categories'],
        ['units-of-measure', 'Units of Measure'],
        ['uom-conversions', 'UOM Conversions'],
        ['barcodes', 'Barcodes'],
        ['batches', 'Batches'],
        ['serial-numbers', 'Serial Numbers'],
    ],
    'supplier-management': [
        ['supplier-master', 'Supplier Master'],
        ['supplier-categories', 'Supplier Categories'],
        ['supplier-materials', 'Supplier Materials'],
        ['supplier-pricing', 'Supplier Pricing'],
        ['payment-terms', 'Payment Terms'],
        ['supplier-documents', 'Supplier Documents'],
        ['supplier-evaluation', 'Supplier Evaluation'],
        ['supplier-performance', 'Supplier Performance'],
    ],
    procurement: [
        ['purchase-requisitions', 'Purchase Requisitions'],
        ['rfqs', 'RFQs'],
        ['supplier-quotations', 'Supplier Quotations'],
        ['quotation-comparison', 'Quotation Comparison'],
        ['purchase-orders', 'Purchase Orders'],
        ['supplier-invoices', 'Supplier Invoices'],
        ['three-way-match', 'Three-Way Match'],
        ['match-exceptions', 'Match Exceptions'],
        ['po-approvals', 'PO Approvals'],
        ['purchase-contracts', 'Purchase Contracts'],
        ['procurement-history', 'Procurement History'],
    ],
    receiving: [
        ['expected-receipts', 'Expected Receipts'],
        ['advanced-shipping-notices', 'Advanced Shipping Notices'],
        ['goods-receipt', 'Goods Receipt'],
        ['receiving-inspection', 'Receiving Workbench'],
        ['quality-dashboard', 'Quality Dashboard'],
        ['inspection-queue', 'Inspection Queue'],
        ['inspection-plans', 'Inspection Plans'],
        ['inspection-rules', 'Inspection Rules'],
        ['defect-codes', 'Defect Codes'],
        ['nonconformances', 'Nonconformances'],
        ['usage-decisions', 'Usage Decisions'],
        ['receiving-variances', 'Receiving Variances'],
        ['quality-quarantine', 'Quality / Quarantine'],
        ['quality-holds', 'Quality Holds'],
    ],
    'inventory-management': [
        ['goods-receipt', 'Goods Receipt'],
        ['stock-overview', 'Stock Overview'],
        ['available-stock', 'Available Stock'],
        ['reservations', 'Reservations'],
        ['stock-movements', 'Stock Movements'],
        ['goods-issue', 'Goods Issue'],
        ['stock-transfers', 'Stock Transfers'],
        ['inventory-adjustments', 'Inventory Adjustments'],
        ['inventory-status', 'Inventory Status'],
        ['inventory-ledger', 'Inventory Ledger'],
        ['traceability', 'Traceability'],
    ],
    'warehouse-management': [
        ['overview', 'Overview'],
        ['task-queue', 'Task Queue'],
        ['my-tasks', 'My Tasks'],
        ['exceptions', 'Exceptions'],
        ['warehouses', 'Warehouses'],
        ['storage-types', 'Storage Types'],
        ['storage-sections', 'Storage Sections'],
        ['storage-shelves', 'Storage Shelves'],
        ['storage-bins', 'Storage Bins'],
        ['bin-capacity', 'Bin Capacity'],
        ['picking', 'Picking'],
        ['packing', 'Packing'],
        ['transfer-orders', 'Transfer Orders'],
        ['transfer-queue', 'Transfer Queue'],
        ['in-transit', 'In Transit'],
        ['transfer-receipts', 'Transfer Receipts'],
        ['transfer-history', 'Transfer History'],
        ['warehouse-transfers', 'Warehouse Transfers'],
    ],
    'inventory-control': [
        ['count-planning', 'Count Planning'],
        ['count-sessions', 'Count Sessions'],
        ['cycle-counting', 'Cycle Counting'],
        ['physical-inventory', 'Physical Inventory'],
        ['blind-counting', 'Blind Counting'],
        ['recounts', 'Recounts'],
        ['variance-analysis', 'Variance Analysis'],
        ['adjustment-approval', 'Adjustment Approval'],
        ['count-history', 'Count History'],
    ],
    'planning-mrp': [
        ['demand', 'Demand'],
        ['mrp-runs', 'MRP Runs'],
        ['projected-stock', 'Projected Stock'],
        ['material-requirements', 'Material Requirements'],
        ['reorder-point', 'Reorder Point'],
        ['safety-stock', 'Safety Stock'],
        ['shortage-monitor', 'Shortage Monitor'],
        ['procurement-suggestions', 'Procurement Suggestions'],
    ],
    valuation: [
        ['inventory-valuation', 'Inventory Valuation'],
        ['cost-layers', 'Cost Layers'],
        ['standard-cost', 'Standard Cost'],
        ['moving-average', 'Moving Average'],
        ['fifo', 'FIFO'],
        ['landed-cost', 'Landed Cost'],
        ['price-variance', 'Price Variance'],
    ],
    'returns-disposal': [
        ['supplier-returns', 'Supplier Returns'],
        ['customer-return-intake', 'Customer Return Intake'],
        ['damaged-stock', 'Damaged Stock'],
        ['expired-stock', 'Expired Stock'],
        ['scrap', 'Scrap'],
        ['disposal', 'Disposal'],
    ],
    'barcode-rfid': [
        ['barcode-scanning', 'Barcode Scanning'],
        ['batch-scanning', 'Batch Scanning'],
        ['serial-scanning', 'Serial Scanning'],
        ['mobile-receiving', 'Mobile Receiving'],
        ['mobile-picking', 'Mobile Picking'],
        ['mobile-counting', 'Mobile Counting'],
    ],
    'reports-analytics': [
        ['stock-reports', 'Stock Reports'],
        ['inventory-valuation-reports', 'Inventory Valuation'],
        ['stock-aging', 'Stock Aging'],
        ['dead-stock', 'Dead Stock'],
        ['inventory-turnover', 'Inventory Turnover'],
        ['procurement-analytics', 'Procurement Analytics'],
        ['supplier-performance-reports', 'Supplier Performance'],
        ['warehouse-performance', 'Warehouse Performance'],
        ['stock-variance', 'Stock Variance'],
        ['quality-analytics', 'Quality Analytics'],
    ],
} as const satisfies Record<string, readonly (readonly [code: string, name: string])[]>

export type MmSubmoduleWithFeatures = keyof typeof MM_FEATURES
export type MmFeatureCode<S extends MmSubmoduleWithFeatures> = (typeof MM_FEATURES)[S][number][0]

/** Resource codes of MM features, type-checked against `MM_FEATURES`, e.g. `mmFeatures('procurement', 'rfqs')`. */
export function mmFeatures<S extends MmSubmoduleWithFeatures>(submodule: S, ...features: MmFeatureCode<S>[]): string[] {
    return features.map((feature) => `mm.${submodule}.${feature}`)
}

function mmFeatureResources(): ResourceDef[] {
    return (Object.entries(MM_FEATURES) as [string, readonly (readonly [string, string])[]][]).flatMap(
        ([submodule, features]) =>
            features.map(([code, name], i) => ({
                code: `mm.${submodule}.${code}`,
                module: MODULE_CODES.MM,
                name,
                description: '',
                sortOrder: (i + 1) * 10,
                parent: `mm.${submodule}`,
            })),
    )
}

/** Grantable resources (submodules). Codes are stable and referenced by guards and the frontend registry. */
export const RESOURCE_CATALOG: ResourceDef[] = [
    ...group('sd', [
        ['pos', 'POS Terminal', 'Over-the-counter sales with immediate billing.'],
        ['customer-master', 'Customer Master', 'Customer accounts, credit limits, and partner functions.'],
        ['product-catalog', 'Product Catalog', 'Storefront and POS products and prices.'],
        ['material-sales-view', 'Material Sales View', 'Sales-relevant material data and pricing views.'],
        ['pricing-conditions', 'Pricing Conditions', 'Price lists, discounts, and condition records.'],
        ['quotations', 'Quotations', 'Customer quotations and their conversion to orders.'],
        ['sales-orders', 'Sales Orders', 'Create, change, and monitor customer sales orders.'],
        ['deliveries', 'Deliveries', 'Outbound deliveries and picking operations.'],
        ['billing', 'Billing', 'Customer invoices and billing documents.'],
        ['reports', 'Reports & Analytics', 'Sales analysis and backorder reports.'],
        ['configuration', 'Configuration', 'Sales organizations and document types.'],
    ]),
    ...group('mm', [
        ['dashboard', 'Analytics Dashboard', 'Charts and reports across Materials Management.'],
        ['exception-center', 'Exception Center', 'Operational exceptions across MM domains.'],
        ['organization', 'Organization', 'Companies and branches that scope MM transactions.'],
        ['material-master', 'Material Master', 'Materials, units, barcodes, batches, and serials.'],
        ['supplier-management', 'Supplier Management', 'Supplier master data, pricing, and performance.'],
        ['procurement', 'Procurement', 'Requisitions, RFQs, quotations, purchase orders, and contracts.'],
        ['receiving', 'Receiving & Quality', 'Expected receipts, goods receipt, inspection, and holds.'],
        ['inventory-management', 'Inventory Management', 'Stock, reservations, movements, issues, and adjustments.'],
        ['warehouse-management', 'Warehouse Management', 'Warehouses, bins, picking, packing, and transfers.'],
        ['inventory-control', 'Inventory Control', 'Cycle counts, physical inventory, and variance approval.'],
        ['planning-mrp', 'Planning / MRP', 'Demand, MRP runs, reorder points, and shortages.'],
        ['valuation', 'Valuation', 'Inventory valuation, costing, landed cost, and variances.'],
        ['returns-disposal', 'Returns & Disposal', 'Supplier and customer returns, scrap, and disposal.'],
        ['barcode-rfid', 'Barcode / RFID Operations', 'Mobile scanning for receiving, picking, and counting.'],
        ['reports-analytics', 'MM Reports & Analytics', 'Stock, valuation, procurement, and warehouse analytics.'],
    ]),
    ...group('fico', [
        ['chart-of-accounts', 'Chart of Accounts', 'G/L accounts and account groups.'],
        ['cost-centers', 'Cost Centers', 'Cost centers and responsibility areas.'],
        ['profit-centers', 'Profit Centers', 'Profit centers for internal reporting.'],
        ['journal-entries', 'Journal Entries', 'Post and reverse accounting documents.'],
        ['accounts-payable', 'Accounts Payable', 'Vendor invoices and outgoing payments.'],
        ['accounts-receivable', 'Accounts Receivable', 'Customer invoices and incoming payments.'],
        ['reports', 'Reports & Analytics', 'Financial statements and cost center reporting.'],
        ['configuration', 'Configuration', 'Fiscal year variants and FI document types.'],
    ]),
    ...group('scm', [
        ['demand-planning', 'Demand Plan', 'Versioned demand plans by product, location, and period.'],
        ['supply-chain-dashboard', 'Supply Chain Dashboard', 'Fleet, shipment, and trip KPIs.'],
        ['shipments', 'Shipments', 'Orders waiting to be delivered.'],
        ['load-building', 'Load Building', 'Assign cargo to trucks within capacity.'],
        ['trip-planning', 'Trip Planning', 'Turn loads into trips and dispatch drivers.'],
        ['trips', 'Trips', 'Trip status and execution.'],
        ['tracking', 'Tracking', 'Live truck positions.'],
        ['vehicles', 'Vehicles', 'Company trucks.'],
        ['drivers', 'Drivers', 'Drivers and availability.'],
        ['maintenance', 'Maintenance', 'Truck repairs and servicing.'],
    ]),
    ...group('crm', [
        ['dashboard', 'CRM Dashboard', 'Leads, pipeline, and open tickets at a glance.'],
        ['customers', 'Customers', 'Customer 360 view.'],
        ['leads', 'Leads', 'Capture, qualify, and convert prospects.'],
        ['opportunities', 'Opportunities', 'Deals through pipeline stages.'],
        ['activities', 'Activities', 'Calls, meetings, and tasks on leads and opportunities.'],
        ['tickets', 'Tickets', 'Customer service cases.'],
        ['loyalty', 'Loyalty', 'Customer loyalty points and tiers.'],
    ]),
    ...group('hcm', [['hris', 'HRIS Access', 'Link to the external HRIS.']]),
    ...mmFeatureResources(),
]

export const RESOURCES_BY_CODE: ReadonlyMap<string, ResourceDef> = new Map(RESOURCE_CATALOG.map((r) => [r.code, r]))

export const NO_ACCESS: CrudFlags = { canRead: false, canCreate: false, canUpdate: false, canDelete: false }
export const FULL_ACCESS: CrudFlags = { canRead: true, canCreate: true, canUpdate: true, canDelete: true }
const READ: CrudFlags = { ...NO_ACCESS, canRead: true }
const READ_CREATE: CrudFlags = { ...READ, canCreate: true }
const NO_DELETE: CrudFlags = { ...FULL_ACCESS, canDelete: false }

/**
 * Defaults per system role and group, applied only to resources that have no stored grant yet
 * (e.g. a resource added to the catalog later). super_admin always resolves as full access.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Partial<Record<ModuleCode, CrudFlags>>> = {
    [USER_ROLES.ADMIN]: { sd: FULL_ACCESS, mm: FULL_ACCESS, fico: NO_DELETE, scm: FULL_ACCESS, crm: FULL_ACCESS, hcm: NO_DELETE },
    [USER_ROLES.EMPLOYEE]: { sd: READ_CREATE, mm: READ_CREATE, scm: READ_CREATE, crm: READ_CREATE },
}

/** Any write grant implies read. */
export function normalizeFlags(flags: CrudFlags): CrudFlags {
    return { ...flags, canRead: flags.canRead || flags.canCreate || flags.canUpdate || flags.canDelete }
}

/** Additive merge: an action is allowed if any source allows it. */
export function mergeFlags(...sources: CrudFlags[]): CrudFlags {
    return sources.reduce<CrudFlags>(
        (acc, f) => ({
            canRead: acc.canRead || f.canRead,
            canCreate: acc.canCreate || f.canCreate,
            canUpdate: acc.canUpdate || f.canUpdate,
            canDelete: acc.canDelete || f.canDelete,
        }),
        NO_ACCESS,
    )
}

export function moduleOfResource(code: string): string {
    return code.split('.')[0]
}
