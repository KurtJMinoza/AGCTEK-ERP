import type { ErpCategory, ErpSubmodule } from '@/types/erp-modules'

type ChildDef = {
    code: string
    title: string
    description?: string
    icon?: string
}

function mmPage(
    code: string,
    title: string,
    description: string,
    icon: string,
): ErpSubmodule {
    return { code, title, description, path: `/modules/mm/${code}`, icon }
}

function mmHub(
    code: string,
    title: string,
    description: string,
    icon: string,
    childGroupTitle: string,
    children: ChildDef[],
): ErpSubmodule {
    return {
        code,
        title,
        description,
        path: `/modules/mm/${code}`,
        icon,
        childGroupTitle,
        children: children.map((child) => ({
            code: child.code,
            title: child.title,
            description:
                child.description ?? `${title} — ${child.title}.`,
            path: `/modules/mm/${code}/${child.code}`,
            icon: child.icon ?? icon,
        })),
    }
}

export const MM_CATEGORIES: ErpCategory[] = [
    {
        code: 'mm-modules',
        title: 'Materials Management',
        submodules: [
            mmPage(
                'dashboard',
                'MM Dashboard',
                'Overview of stock, procurement, warehouse, and valuation KPIs.',
                'barChart',
            ),
            mmHub(
                'material-master',
                'Material Master',
                'Materials, SKUs, units, barcodes, batches, and serial tracking.',
                'package',
                'Material Master',
                [
                    {
                        code: 'materials-skus',
                        title: 'Materials / SKUs',
                        icon: 'package',
                    },
                    {
                        code: 'material-types',
                        title: 'Material Types',
                        icon: 'layers',
                    },
                    {
                        code: 'material-categories',
                        title: 'Material Categories',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'units-of-measure',
                        title: 'Units of Measure',
                        icon: 'calculator',
                    },
                    {
                        code: 'uom-conversions',
                        title: 'UOM Conversions',
                        icon: 'receipt',
                    },
                    { code: 'barcodes', title: 'Barcodes', icon: 'fileText' },
                    { code: 'batches', title: 'Batches', icon: 'boxes' },
                    {
                        code: 'serial-numbers',
                        title: 'Serial Numbers',
                        icon: 'clipboard',
                    },
                ],
            ),
            mmHub(
                'supplier-management',
                'Supplier Management',
                'Supplier master data, pricing, documents, and performance.',
                'users',
                'Supplier Management',
                [
                    {
                        code: 'supplier-master',
                        title: 'Supplier Master',
                        icon: 'users',
                    },
                    {
                        code: 'supplier-categories',
                        title: 'Supplier Categories',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'supplier-materials',
                        title: 'Supplier Materials',
                        icon: 'package',
                    },
                    {
                        code: 'supplier-pricing',
                        title: 'Supplier Pricing',
                        icon: 'receipt',
                    },
                    {
                        code: 'payment-terms',
                        title: 'Payment Terms',
                        icon: 'creditCard',
                    },
                    {
                        code: 'supplier-documents',
                        title: 'Supplier Documents',
                        icon: 'fileText',
                    },
                    {
                        code: 'supplier-evaluation',
                        title: 'Supplier Evaluation',
                        icon: 'clipboard',
                    },
                    {
                        code: 'supplier-performance',
                        title: 'Supplier Performance',
                        icon: 'lineChart',
                    },
                ],
            ),
            mmHub(
                'procurement',
                'Procurement',
                'Requisitions, RFQs, quotations, purchase orders, and contracts.',
                'shoppingCart',
                'Procurement',
                [
                    {
                        code: 'purchase-requisitions',
                        title: 'Purchase Requisitions',
                        icon: 'clipboard',
                    },
                    { code: 'rfqs', title: 'RFQs', icon: 'fileText' },
                    {
                        code: 'supplier-quotations',
                        title: 'Supplier Quotations',
                        icon: 'receipt',
                    },
                    {
                        code: 'quotation-comparison',
                        title: 'Quotation Comparison',
                        icon: 'fileSpreadsheet',
                    },
                    {
                        code: 'purchase-orders',
                        title: 'Purchase Orders',
                        icon: 'clipboard',
                    },
                    {
                        code: 'po-approvals',
                        title: 'PO Approvals',
                        icon: 'clipboard',
                    },
                    {
                        code: 'purchase-contracts',
                        title: 'Purchase Contracts',
                        icon: 'fileText',
                    },
                    {
                        code: 'procurement-history',
                        title: 'Procurement History',
                        icon: 'calendar',
                    },
                ],
            ),
            mmHub(
                'receiving',
                'Receiving',
                'Expected receipts, ASN, goods receipt, inspection, and returns.',
                'truck',
                'Receiving',
                [
                    {
                        code: 'expected-receipts',
                        title: 'Expected Receipts',
                        icon: 'calendar',
                    },
                    {
                        code: 'advanced-shipping-notices',
                        title: 'Advanced Shipping Notices',
                        icon: 'truck',
                    },
                    {
                        code: 'goods-receipt',
                        title: 'Goods Receipt',
                        icon: 'boxes',
                    },
                    {
                        code: 'receiving-inspection',
                        title: 'Receiving Inspection',
                        icon: 'clipboard',
                    },
                    {
                        code: 'receiving-variances',
                        title: 'Receiving Variances',
                        icon: 'fileSpreadsheet',
                    },
                    {
                        code: 'quality-quarantine',
                        title: 'Quality / Quarantine',
                        icon: 'layers',
                    },
                    {
                        code: 'supplier-returns',
                        title: 'Supplier Returns',
                        icon: 'truck',
                    },
                ],
            ),
            mmHub(
                'inventory-management',
                'Inventory Management',
                'Stock levels, reservations, movements, issues, and ledger.',
                'warehouse',
                'Inventory Management',
                [
                    {
                        code: 'stock-overview',
                        title: 'Stock Overview',
                        icon: 'barChart',
                    },
                    {
                        code: 'available-stock',
                        title: 'Available Stock',
                        icon: 'boxes',
                    },
                    {
                        code: 'reservations',
                        title: 'Reservations',
                        icon: 'clipboard',
                    },
                    {
                        code: 'stock-movements',
                        title: 'Stock Movements',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'goods-issue',
                        title: 'Goods Issue',
                        icon: 'boxes',
                    },
                    {
                        code: 'stock-transfers',
                        title: 'Stock Transfers',
                        icon: 'truck',
                    },
                    {
                        code: 'inventory-adjustments',
                        title: 'Inventory Adjustments',
                        icon: 'calculator',
                    },
                    {
                        code: 'inventory-status',
                        title: 'Inventory Status',
                        icon: 'layers',
                    },
                    {
                        code: 'inventory-ledger',
                        title: 'Inventory Ledger',
                        icon: 'fileSpreadsheet',
                    },
                ],
            ),
            mmHub(
                'warehouse-management',
                'Warehouse Management',
                'Warehouses, storage structure, putaway, picking, and transfers.',
                'building',
                'Warehouse Management',
                [
                    {
                        code: 'warehouses',
                        title: 'Warehouses',
                        icon: 'building',
                    },
                    {
                        code: 'storage-types',
                        title: 'Storage Types',
                        icon: 'layers',
                    },
                    {
                        code: 'storage-sections',
                        title: 'Storage Sections',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'storage-bins',
                        title: 'Storage Bins',
                        icon: 'boxes',
                    },
                    {
                        code: 'bin-capacity',
                        title: 'Bin Capacity',
                        icon: 'calculator',
                    },
                    { code: 'putaway', title: 'Putaway', icon: 'warehouse' },
                    { code: 'picking', title: 'Picking', icon: 'clipboard' },
                    { code: 'packing', title: 'Packing', icon: 'package' },
                    {
                        code: 'warehouse-transfers',
                        title: 'Warehouse Transfers',
                        icon: 'truck',
                    },
                ],
            ),
            mmHub(
                'inventory-control',
                'Inventory Control',
                'Cycle counting, physical inventory, recounts, and variance approval.',
                'clipboard',
                'Inventory Control',
                [
                    {
                        code: 'cycle-counting',
                        title: 'Cycle Counting',
                        icon: 'clipboard',
                    },
                    {
                        code: 'physical-inventory',
                        title: 'Physical Inventory',
                        icon: 'boxes',
                    },
                    {
                        code: 'blind-counting',
                        title: 'Blind Counting',
                        icon: 'layers',
                    },
                    { code: 'recounts', title: 'Recounts', icon: 'clipboard' },
                    {
                        code: 'variance-analysis',
                        title: 'Variance Analysis',
                        icon: 'barChart',
                    },
                    {
                        code: 'adjustment-approval',
                        title: 'Adjustment Approval',
                        icon: 'fileText',
                    },
                ],
            ),
            mmHub(
                'planning-mrp',
                'Planning / MRP',
                'Demand planning, MRP runs, reorder points, and shortage monitoring.',
                'factory',
                'Planning / MRP',
                [
                    { code: 'demand', title: 'Demand', icon: 'lineChart' },
                    { code: 'mrp-runs', title: 'MRP Runs', icon: 'factory' },
                    {
                        code: 'material-requirements',
                        title: 'Material Requirements',
                        icon: 'clipboard',
                    },
                    {
                        code: 'reorder-point',
                        title: 'Reorder Point',
                        icon: 'calculator',
                    },
                    {
                        code: 'safety-stock',
                        title: 'Safety Stock',
                        icon: 'layers',
                    },
                    {
                        code: 'shortage-monitor',
                        title: 'Shortage Monitor',
                        icon: 'activity',
                    },
                    {
                        code: 'procurement-suggestions',
                        title: 'Procurement Suggestions',
                        icon: 'shoppingCart',
                    },
                ],
            ),
            mmHub(
                'valuation',
                'Valuation',
                'Inventory valuation, costing methods, landed cost, and variances.',
                'calculator',
                'Valuation',
                [
                    {
                        code: 'inventory-valuation',
                        title: 'Inventory Valuation',
                        icon: 'calculator',
                    },
                    {
                        code: 'cost-layers',
                        title: 'Cost Layers',
                        icon: 'layers',
                    },
                    {
                        code: 'standard-cost',
                        title: 'Standard Cost',
                        icon: 'receipt',
                    },
                    {
                        code: 'moving-average',
                        title: 'Moving Average',
                        icon: 'lineChart',
                    },
                    { code: 'fifo', title: 'FIFO', icon: 'gitBranch' },
                    {
                        code: 'landed-cost',
                        title: 'Landed Cost',
                        icon: 'truck',
                    },
                    {
                        code: 'price-variance',
                        title: 'Price Variance',
                        icon: 'barChart',
                    },
                ],
            ),
            mmHub(
                'returns-disposal',
                'Returns & Disposal',
                'Supplier returns, damaged stock, scrap, and disposal workflows.',
                'truck',
                'Returns & Disposal',
                [
                    {
                        code: 'supplier-returns',
                        title: 'Supplier Returns',
                        icon: 'truck',
                    },
                    {
                        code: 'customer-return-intake',
                        title: 'Customer Return Intake',
                        icon: 'users',
                    },
                    {
                        code: 'damaged-stock',
                        title: 'Damaged Stock',
                        icon: 'boxes',
                    },
                    {
                        code: 'expired-stock',
                        title: 'Expired Stock',
                        icon: 'calendar',
                    },
                    { code: 'scrap', title: 'Scrap', icon: 'layers' },
                    { code: 'disposal', title: 'Disposal', icon: 'fileText' },
                ],
            ),
            mmHub(
                'barcode-rfid',
                'Barcode / RFID Operations',
                'Mobile scanning for receiving, picking, counting, and batch/serial tracking.',
                'fileText',
                'Barcode / RFID Operations',
                [
                    {
                        code: 'barcode-scanning',
                        title: 'Barcode Scanning',
                        icon: 'fileText',
                    },
                    {
                        code: 'batch-scanning',
                        title: 'Batch Scanning',
                        icon: 'layers',
                    },
                    {
                        code: 'serial-scanning',
                        title: 'Serial Scanning',
                        icon: 'clipboard',
                    },
                    {
                        code: 'mobile-receiving',
                        title: 'Mobile Receiving',
                        icon: 'truck',
                    },
                    {
                        code: 'mobile-picking',
                        title: 'Mobile Picking',
                        icon: 'clipboard',
                    },
                    {
                        code: 'mobile-counting',
                        title: 'Mobile Counting',
                        icon: 'calculator',
                    },
                ],
            ),
            mmHub(
                'reports-analytics',
                'MM Reports & Analytics',
                'Stock, valuation, aging, procurement, supplier, and warehouse analytics.',
                'barChart',
                'MM Reports & Analytics',
                [
                    {
                        code: 'stock-reports',
                        title: 'Stock Reports',
                        icon: 'fileSpreadsheet',
                    },
                    {
                        code: 'inventory-valuation-reports',
                        title: 'Inventory Valuation',
                        icon: 'calculator',
                    },
                    {
                        code: 'stock-aging',
                        title: 'Stock Aging',
                        icon: 'calendar',
                    },
                    {
                        code: 'dead-stock',
                        title: 'Dead Stock',
                        icon: 'layers',
                    },
                    {
                        code: 'inventory-turnover',
                        title: 'Inventory Turnover',
                        icon: 'lineChart',
                    },
                    {
                        code: 'procurement-analytics',
                        title: 'Procurement Analytics',
                        icon: 'shoppingCart',
                    },
                    {
                        code: 'supplier-performance-reports',
                        title: 'Supplier Performance',
                        icon: 'users',
                    },
                    {
                        code: 'warehouse-performance',
                        title: 'Warehouse Performance',
                        icon: 'warehouse',
                    },
                    {
                        code: 'stock-variance',
                        title: 'Stock Variance',
                        icon: 'barChart',
                    },
                ],
            ),
        ],
    },
]
