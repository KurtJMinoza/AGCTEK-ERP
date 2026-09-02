import type { ErpModule, ErpModuleCode } from '@/types/erp-modules'

/**
 * Single source of truth for ERP navigation.
 * Rename any `title` field here to customize display names app-wide.
 */
export const ERP_MODULES: ErpModule[] = [
    {
        code: 'sd',
        shortTitle: 'SD',
        title: 'Sales & Distribution',
        description:
            'Manage the complete order-to-cash cycle — customers, pricing, sales orders, deliveries, and billing.',
        path: '/modules/sd',
        icon: 'shoppingCart',
        categories: [
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'customer-master',
                        title: 'Customer Master',
                        description:
                            'Maintain customer accounts, credit limits, and partner functions.',
                        path: '/modules/sd/customer-master',
                        icon: 'users',
                    },
                    {
                        code: 'material-sales-view',
                        title: 'Material Sales View',
                        description:
                            'Configure sales-relevant material data and pricing views.',
                        path: '/modules/sd/material-sales-view',
                        icon: 'package',
                    },
                    {
                        code: 'pricing-conditions',
                        title: 'Pricing Conditions',
                        description:
                            'Define price lists, discounts, and condition records.',
                        path: '/modules/sd/pricing-conditions',
                        icon: 'receipt',
                    },
                ],
            },
            {
                code: 'transactional',
                title: 'Transactional',
                submodules: [
                    {
                        code: 'sales-orders',
                        title: 'Sales Orders',
                        description:
                            'Create, change, and monitor customer sales orders.',
                        path: '/modules/sd/sales-orders',
                        icon: 'clipboard',
                    },
                    {
                        code: 'deliveries',
                        title: 'Deliveries',
                        description:
                            'Process outbound deliveries and picking operations.',
                        path: '/modules/sd/deliveries',
                        icon: 'truck',
                    },
                    {
                        code: 'billing',
                        title: 'Billing',
                        description:
                            'Generate customer invoices and manage billing documents.',
                        path: '/modules/sd/billing',
                        icon: 'fileText',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'sales-analysis',
                        title: 'Sales Analysis',
                        description:
                            'Analyze revenue trends, order volumes, and product mix.',
                        path: '/modules/sd/sales-analysis',
                        icon: 'barChart',
                    },
                    {
                        code: 'backorder-report',
                        title: 'Backorder Report',
                        description:
                            'Track open quantities and delivery bottlenecks.',
                        path: '/modules/sd/backorder-report',
                        icon: 'lineChart',
                    },
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'sales-org',
                        title: 'Sales Organization',
                        description:
                            'Configure sales orgs, distribution channels, and divisions.',
                        path: '/modules/sd/sales-org',
                        icon: 'building',
                    },
                    {
                        code: 'document-types',
                        title: 'Document Types',
                        description:
                            'Define SD document types and number ranges.',
                        path: '/modules/sd/document-types',
                        icon: 'settings',
                    },
                ],
            },
        ],
    },
    {
        code: 'mm',
        shortTitle: 'MM',
        title: 'Materials Management',
        description:
            'Procure, store, and manage materials — vendors, inventory, goods movements, and valuation.',
        path: '/modules/mm',
        icon: 'warehouse',
        categories: [
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'material-master',
                        title: 'Material Master',
                        description:
                            'Create and maintain material master records across views.',
                        path: '/modules/mm/material-master',
                        icon: 'package',
                    },
                    {
                        code: 'vendor-master',
                        title: 'Vendor Master',
                        description:
                            'Manage supplier accounts, payment terms, and purchasing data.',
                        path: '/modules/mm/vendor-master',
                        icon: 'users',
                    },
                    {
                        code: 'batch-management',
                        title: 'Batch Management',
                        description:
                            'Track batch numbers, shelf life, and quality certificates.',
                        path: '/modules/mm/batch-management',
                        icon: 'layers',
                    },
                ],
            },
            {
                code: 'transactional',
                title: 'Transactional',
                submodules: [
                    {
                        code: 'purchase-orders',
                        title: 'Purchase Orders',
                        description:
                            'Create and approve purchase requisitions and orders.',
                        path: '/modules/mm/purchase-orders',
                        icon: 'clipboard',
                    },
                    {
                        code: 'goods-receipt',
                        title: 'Goods Receipt',
                        description:
                            'Post goods receipts against purchase orders.',
                        path: '/modules/mm/goods-receipt',
                        icon: 'boxes',
                    },
                    {
                        code: 'inventory-management',
                        title: 'Inventory Management',
                        description:
                            'Monitor stock levels, reservations, and transfers.',
                        path: '/modules/mm/inventory-management',
                        icon: 'warehouse',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'stock-overview',
                        title: 'Stock Overview',
                        description:
                            'Real-time stock by plant, storage location, and material.',
                        path: '/modules/mm/stock-overview',
                        icon: 'barChart',
                    },
                    {
                        code: 'material-valuation',
                        title: 'Material Valuation',
                        description:
                            'Review inventory value by valuation class and price.',
                        path: '/modules/mm/material-valuation',
                        icon: 'fileSpreadsheet',
                    },
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'plants-storage',
                        title: 'Plants & Storage Locations',
                        description:
                            'Configure plants, storage locations, and warehouse structure.',
                        path: '/modules/mm/plants-storage',
                        icon: 'building',
                    },
                    {
                        code: 'movement-types',
                        title: 'Movement Types',
                        description:
                            'Define goods movement types and automatic account determination.',
                        path: '/modules/mm/movement-types',
                        icon: 'cog',
                    },
                ],
            },
        ],
    },
    {
        code: 'fico',
        shortTitle: 'FICO',
        title: 'Finance & Controlling',
        description:
            'General ledger, accounts payable/receivable, asset accounting, and cost controlling.',
        path: '/modules/fico',
        icon: 'calculator',
        categories: [
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'chart-of-accounts',
                        title: 'Chart of Accounts',
                        description:
                            'Maintain G/L accounts and account groups.',
                        path: '/modules/fico/chart-of-accounts',
                        icon: 'landmark',
                    },
                    {
                        code: 'cost-centers',
                        title: 'Cost Centers',
                        description:
                            'Define cost centers and responsibility areas.',
                        path: '/modules/fico/cost-centers',
                        icon: 'building',
                    },
                    {
                        code: 'profit-centers',
                        title: 'Profit Centers',
                        description:
                            'Configure profit centers for internal reporting.',
                        path: '/modules/fico/profit-centers',
                        icon: 'lineChart',
                    },
                ],
            },
            {
                code: 'transactional',
                title: 'Transactional',
                submodules: [
                    {
                        code: 'journal-entries',
                        title: 'Journal Entries',
                        description:
                            'Post and reverse financial accounting documents.',
                        path: '/modules/fico/journal-entries',
                        icon: 'fileText',
                    },
                    {
                        code: 'accounts-payable',
                        title: 'Accounts Payable',
                        description:
                            'Process vendor invoices and outgoing payments.',
                        path: '/modules/fico/accounts-payable',
                        icon: 'creditCard',
                    },
                    {
                        code: 'accounts-receivable',
                        title: 'Accounts Receivable',
                        description:
                            'Manage customer invoices and incoming payments.',
                        path: '/modules/fico/accounts-receivable',
                        icon: 'receipt',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'financial-statements',
                        title: 'Financial Statements',
                        description:
                            'Balance sheet, P&L, and cash flow reports.',
                        path: '/modules/fico/financial-statements',
                        icon: 'fileSpreadsheet',
                    },
                    {
                        code: 'cost-center-reporting',
                        title: 'Cost Center Reporting',
                        description:
                            'Analyze actual vs. plan costs by cost center.',
                        path: '/modules/fico/cost-center-reporting',
                        icon: 'barChart',
                    },
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'fiscal-year-variant',
                        title: 'Fiscal Year Variant',
                        description:
                            'Define posting periods and fiscal year structure.',
                        path: '/modules/fico/fiscal-year-variant',
                        icon: 'calendar',
                    },
                    {
                        code: 'document-types-fi',
                        title: 'FI Document Types',
                        description:
                            'Configure financial document types and number ranges.',
                        path: '/modules/fico/document-types-fi',
                        icon: 'settings',
                    },
                ],
            },
        ],
    },
    {
        code: 'crm',
        shortTitle: 'CRM',
        title: 'Customer Relationship Management',
        description:
            'Manage leads, accounts, opportunities, and customer engagement across the sales cycle.',
        path: '/modules/crm',
        icon: 'crm',
        categories: [
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'accounts',
                        title: 'Accounts',
                        description:
                            'Maintain customer and prospect account records.',
                        path: '/modules/crm/accounts',
                        icon: 'building',
                    },
                    {
                        code: 'contacts',
                        title: 'Contacts',
                        description:
                            'Manage contact persons, roles, and communication details.',
                        path: '/modules/crm/contacts',
                        icon: 'users',
                    },
                    {
                        code: 'leads',
                        title: 'Leads',
                        description:
                            'Capture and qualify inbound and outbound sales leads.',
                        path: '/modules/crm/leads',
                        icon: 'userCircle',
                    },
                ],
            },
            {
                code: 'transactional',
                title: 'Transactional',
                submodules: [
                    {
                        code: 'opportunities',
                        title: 'Opportunities',
                        description:
                            'Track deals, pipeline stages, and expected revenue.',
                        path: '/modules/crm/opportunities',
                        icon: 'lineChart',
                    },
                    {
                        code: 'activities',
                        title: 'Activities',
                        description:
                            'Log calls, meetings, tasks, and follow-ups.',
                        path: '/modules/crm/activities',
                        icon: 'clipboard',
                    },
                    {
                        code: 'campaigns',
                        title: 'Campaigns',
                        description:
                            'Plan and monitor marketing and outreach campaigns.',
                        path: '/modules/crm/campaigns',
                        icon: 'activity',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'pipeline-analytics',
                        title: 'Pipeline Analytics',
                        description:
                            'Analyze win rates, forecast accuracy, and deal velocity.',
                        path: '/modules/crm/pipeline-analytics',
                        icon: 'barChart',
                    },
                    {
                        code: 'customer-insights',
                        title: 'Customer Insights',
                        description:
                            'Review engagement trends and account health scores.',
                        path: '/modules/crm/customer-insights',
                        icon: 'fileSpreadsheet',
                    },
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'sales-stages',
                        title: 'Sales Stages',
                        description:
                            'Define pipeline stages and transition rules.',
                        path: '/modules/crm/sales-stages',
                        icon: 'settings',
                    },
                    {
                        code: 'lead-sources',
                        title: 'Lead Sources',
                        description:
                            'Configure lead source types and attribution.',
                        path: '/modules/crm/lead-sources',
                        icon: 'cog',
                    },
                ],
            },
        ],
    },
    {
        code: 'scm',
        shortTitle: 'SCM',
        title: 'Supply Chain Management',
        description:
            'End-to-end supply chain visibility — demand planning, logistics, and supplier collaboration.',
        path: '/modules/scm',
        icon: 'truck',
        categories: [
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'supply-network',
                        title: 'Supply Network',
                        description:
                            'Model suppliers, plants, and distribution lanes.',
                        path: '/modules/scm/supply-network',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'product-locations',
                        title: 'Product Locations',
                        description:
                            'Assign products to locations and sourcing rules.',
                        path: '/modules/scm/product-locations',
                        icon: 'package',
                    },
                ],
            },
            {
                code: 'transactional',
                title: 'Transactional',
                submodules: [
                    {
                        code: 'demand-planning',
                        title: 'Demand Planning',
                        description:
                            'Forecast demand and collaborate on consensus plans.',
                        path: '/modules/scm/demand-planning',
                        icon: 'lineChart',
                    },
                    {
                        code: 'transportation',
                        title: 'Transportation Management',
                        description:
                            'Plan shipments, carriers, and freight costs.',
                        path: '/scm',
                        icon: 'truck',
                    },
                    {
                        code: 'warehouse-operations',
                        title: 'Warehouse Operations',
                        description:
                            'Manage inbound/outbound warehouse tasks and slotting.',
                        path: '/modules/scm/warehouse-operations',
                        icon: 'warehouse',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'supply-chain-dashboard',
                        title: 'Supply Chain Dashboard',
                        description:
                            'KPIs for OTIF, lead times, and inventory turns.',
                        path: '/modules/scm/supply-chain-dashboard',
                        icon: 'barChart',
                    },
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'planning-horizons',
                        title: 'Planning Horizons',
                        description:
                            'Set planning buckets and frozen zone parameters.',
                        path: '/modules/scm/planning-horizons',
                        icon: 'settings',
                    },
                ],
            },
        ],
    },
]

/** Lookup helpers — use these instead of scanning the array directly */
export function getErpModule(code: string): ErpModule | undefined {
    return ERP_MODULES.find((m) => m.code === code)
}

export function getErpModuleByPath(pathname: string): ErpModule | undefined {
    return ERP_MODULES.find(
        (m) =>
            pathname === m.path ||
            pathname.startsWith(`${m.path}/`),
    )
}

export function getAllSubmodules(module: ErpModule) {
    return module.categories.flatMap((category) =>
        category.submodules.map((submodule) => ({
            category,
            submodule,
        })),
    )
}

export function findSubmoduleByPath(pathname: string) {
    for (const module of ERP_MODULES) {
        for (const category of module.categories) {
            const submodule = category.submodules.find(
                (s) => s.path === pathname,
            )
            if (submodule) {
                return { module, category, submodule }
            }
        }
    }
    return undefined
}

export function isValidModuleCode(code: string): code is ErpModuleCode {
    return ERP_MODULES.some((m) => m.code === code)
}

/**
 * Override display titles without changing structure.
 * Example: ERP_TITLE_OVERRIDES.sd = { title: 'Sales & Delivery' }
 */
export const ERP_TITLE_OVERRIDES: Partial<
    Record<
        ErpModuleCode,
        {
            title?: string
            shortTitle?: string
            categories?: Record<string, { title?: string }>
            submodules?: Record<string, { title?: string }>
        }
    >
> = {}

/** Returns modules with any title overrides applied */
export function getResolvedErpModules(): ErpModule[] {
    return ERP_MODULES.map((module) => {
        const override = ERP_TITLE_OVERRIDES[module.code]
        if (!override) return module

        return {
            ...module,
            title: override.title ?? module.title,
            shortTitle: override.shortTitle ?? module.shortTitle,
            categories: module.categories.map((category) => ({
                ...category,
                title:
                    override.categories?.[category.code]?.title ??
                    category.title,
                submodules: category.submodules.map((submodule) => ({
                    ...submodule,
                    title:
                        override.submodules?.[submodule.code]?.title ??
                        submodule.title,
                })),
            })),
        }
    })
}
