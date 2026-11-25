import type { ErpModule, ErpModuleCode, ErpSubmodule } from '@/types/erp-modules'
import { MM_CATEGORIES } from '@/configs/erp-modules/mm.module'

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
                code: 'sales-channels',
                title: 'Sales Channels',
                submodules: [
                    {
                        code: 'pos',
                        title: 'POS Terminal',
                        description:
                            'Over-the-counter cash sales with immediate stock deduction and billing.',
                        path: '/modules/sd/pos',
                        icon: 'creditCard',
                    },
                    {
                        code: 'ecommerce',
                        title: 'E-commerce',
                        description:
                            'Open the Amalgated Shop — the customer-facing online store for AWIC, MCONPINCO and LPG.',
                        path: '/shop',
                        icon: 'storefront',
                        isExternalLink: true,
                    },
                ],
            },
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
                        code: 'product-catalog',
                        title: 'Product Catalog',
                        description:
                            'Add, edit and price the products sold on the AWIC, LPG and MCONPINCO storefronts and POS.',
                        path: '/modules/sd/product-catalog',
                        icon: 'tag',
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
                        code: 'sales-returns',
                        permissionCode: 'sd.sales-returns',
                        title: 'Sales Returns',
                        description:
                            'Customer return requests from damaged deliveries — authorize and open the MM intake.',
                        path: '/modules/sd/sales-returns',
                        icon: 'receipt',
                    },
                    {
                        code: 'customer-returns',
                        permissionCode: 'sd.sales-returns',
                        title: 'Customer Returns',
                        description:
                            'Return requests from delivered orders — approve, receive, inspect, restock, refund, and close.',
                        path: '/modules/sd/customer-returns',
                        icon: 'receipt',
                    },
                    {
                        code: 'billing',
                        title: 'Billing',
                        description:
                            'Generate customer invoices and manage billing documents.',
                        path: '/modules/sd/billing',
                        icon: 'fileText',
                    },
                    {
                        code: 'ext-platform-sales',
                        permissionCode: 'sd.ext-platform-sales',
                        title: 'External Platform Sales',
                        description:
                            'Manually record sales from Shopee, Lazada, TikTok Shop, Facebook Marketplace, distributors, resellers, and other external channels with automatic tax determination.',
                        path: '/modules/sd/ext-platform-sales',
                        icon: 'shoppingCart',
                    },
                ],
            },
            {
                code: 'reports',
                title: 'Reports & Analytics',
                submodules: [
                    {
                        code: 'sales-analysis',
                        permissionCode: 'sd.reports',
                        title: 'Sales Analysis',
                        description:
                            'Analyze revenue trends, order volumes, and product mix.',
                        path: '/modules/sd/sales-analysis',
                        icon: 'barChart',
                    },
                    {
                        code: 'backorder-report',
                        permissionCode: 'sd.reports',
                        title: 'Backorder Report',
                        description:
                            'Track open quantities and delivery bottlenecks.',
                        path: '/modules/sd/backorder-report',
                        icon: 'lineChart',
                    },
                    {
                        code: 'monthly-collection',
                        permissionCode: 'sd.reports',
                        title: 'Monthly Collection',
                        description:
                            'Monthly collection monitoring by tender type — Cash, GCash, bank, cheque, and others.',
                        path: '/modules/sd/monthly-collection',
                        icon: 'receipt',
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
            'End-to-end materials operations — master data, procurement, receiving, inventory, warehouse, planning, valuation, and analytics.',
        path: '/modules/mm',
        icon: 'warehouse',
        categories: MM_CATEGORIES,
    },
    {
        code: 'fico',
        shortTitle: 'FICO',
        title: 'Finance & Controlling',
        description:
            'Financial controller setup: chart of accounts and fiscal calendar configuration.',
        path: '/modules/fico',
        icon: 'calculator',
        categories: [
            {
                code: 'general-ledger',
                title: 'General Ledger',
                submodules: [
                    {
                        code: 'overview',
                        permissionCode: 'fico.overview',
                        title: 'Financial Overview',
                        description:
                            'Company financial health, period status, and recent accounting activity.',
                        path: '/modules/fico/overview',
                        icon: 'lineChart',
                    },
                    {
                        code: 'journal-entries',
                        permissionCode: 'fico.journal-entries',
                        title: 'Journal Entries',
                        description:
                            'Manual journal workbench: create, approve, post, and reverse documents.',
                        path: '/modules/fico/journal-entries',
                        icon: 'fileText',
                    },
                    {
                        code: 'general-ledger',
                        permissionCode: 'fico.journal-entries',
                        title: 'General Ledger',
                        description:
                            'Committed G/L line inquiry with drill-down to journals and source documents.',
                        path: '/modules/fico/general-ledger',
                        icon: 'fileText',
                    },
                    {
                        code: 'account-balances',
                        permissionCode: 'fico.reports',
                        title: 'Account Balances',
                        description:
                            'Company-wide opening, movement, and closing balances by G/L account.',
                        path: '/modules/fico/account-balances',
                        icon: 'lineChart',
                    },
                    {
                        code: 'trial-balance',
                        permissionCode: 'fico.reports',
                        title: 'Trial Balance',
                        description:
                            'Opening, period, and closing trial balance with reconciliation totals.',
                        path: '/modules/fico/trial-balance',
                        icon: 'lineChart',
                    },
                ],
            },
            {
                code: 'master-data',
                title: 'Master Data',
                submodules: [
                    {
                        code: 'chart-of-accounts',
                        permissionCode: 'fico.chart-of-accounts',
                        title: 'Chart of Accounts',
                        description:
                            'Define the shared ledger structure: charts, account groups, and posting controls.',
                        path: '/modules/fico/chart-of-accounts',
                        icon: 'landmark',
                    },
                    {
                        code: 'gl-accounts',
                        permissionCode: 'fico.gl-accounts',
                        title: 'G/L Account Master',
                        description:
                            'Maintain account master data, classifications, company assignments, and posting controls (not live ledger balances).',
                        path: '/modules/fico/gl-accounts',
                        icon: 'fileText',
                    },
                ],
            },
            {
                code: 'accounting-configuration',
                title: 'Accounting Configuration',
                submodules: [
                    {
                        code: 'company-accounting-settings',
                        permissionCode: 'fico.company-settings',
                        title: 'Company Accounting Settings',
                        description:
                            'Assign chart, fiscal calendar, currency, and activate company accounting.',
                        path: '/modules/fico/company-accounting-settings',
                        icon: 'building',
                    },
                    {
                        code: 'account-determination-rules',
                        permissionCode: 'fico.account-determination',
                        title: 'Account Determination Rules',
                        description:
                            'Centralized MM, SD, and PP determination rules with approval lifecycle.',
                        path: '/modules/fico/account-determination-rules',
                        icon: 'fileText',
                    },
                    {
                        code: 'mm-account-determination',
                        permissionCode: 'fico.account-determination',
                        title: 'MM Transaction-Key Mappings',
                        description:
                            'Debit and credit G/L mappings for automatic MM inventory journal posting.',
                        path: '/modules/fico/account-determination',
                        icon: 'settings',
                    },
                    {
                        code: 'fiscal-years',
                        permissionCode: 'fico.periods',
                        title: 'Fiscal Year Variants',
                        description:
                            'Define fiscal year variants and generate company posting calendars.',
                        path: '/modules/fico/fiscal-years',
                        icon: 'calendar',
                    },
                    {
                        code: 'fiscal-periods',
                        permissionCode: 'fico.periods',
                        title: 'Posting Periods',
                        description:
                            'Open, restrict, close, lock, and reopen financial posting periods.',
                        path: '/modules/fico/fiscal-periods',
                        icon: 'calendar',
                    },
                    {
                        code: 'document-types-fi',
                        permissionCode: 'fico.document-types',
                        title: 'Document Types',
                        description:
                            'Accounting document types, numbering controls, and reversal settings.',
                        path: '/modules/fico/document-types',
                        icon: 'settings',
                    },
                    {
                        code: 'number-ranges',
                        permissionCode: 'fico.number-ranges',
                        title: 'Number Ranges',
                        description:
                            'Document number ranges for accounting and financial documents.',
                        path: '/modules/fico/number-ranges',
                        icon: 'settings',
                    },
                    {
                        code: 'tax-codes',
                        permissionCode: 'fico.tax-codes',
                        title: 'Tax Codes',
                        description:
                            'Tax classifications, effective-dated rates, and G/L mappings.',
                        path: '/modules/fico/tax-codes',
                        icon: 'receipt',
                    },
                ],
            },
            {
                code: 'integration-monitoring',
                title: 'Integration & Monitoring',
                submodules: [
                    {
                        code: 'accounting-events',
                        permissionCode: 'fico.journal-entries',
                        title: 'Accounting Events',
                        description:
                            'Posting monitor for MM, SD, POS, and PP accounting events reaching FICO.',
                        path: '/modules/fico/accounting-events',
                        icon: 'activity',
                    },
                    {
                        code: 'accounting-reconciliation',
                        permissionCode: 'fico.accounting-reconciliation',
                        title: 'Accounting Reconciliation',
                        description:
                            'Integrity exceptions, investigation workflow, and authorized retries without silent G/L edits.',
                        path: '/modules/fico/accounting-reconciliation',
                        icon: 'activity',
                    },
                ],
            },
            {
                code: 'period-end',
                title: 'Period End & Migration',
                submodules: [
                    {
                        code: 'period-closing',
                        permissionCode: 'fico.period-close',
                        title: 'Period Closing',
                        description:
                            'Closing readiness checklist before close or lock; unsupported controls marked N/A.',
                        path: '/modules/fico/period-closing',
                        icon: 'calendar',
                    },
                    {
                        code: 'year-end-closing',
                        permissionCode: 'fico.year-end-close',
                        title: 'Year-End Closing',
                        description:
                            'Validate the ledger, close P&L to retained earnings, and audit idempotent year-end journals.',
                        path: '/modules/fico/year-end-closing',
                        icon: 'calendar',
                    },
                    {
                        code: 'opening-balances',
                        permissionCode: 'fico.opening-balances',
                        title: 'Opening Balances',
                        description:
                            'Migration batches: import, approve, and post opening journals via the financial engine.',
                        path: '/modules/fico/opening-balances',
                        icon: 'fileText',
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
            'Leads, sales pipeline, customer service tickets and a 360° view of SD customers.',
        path: '/modules/crm',
        icon: 'crm',
        categories: [
            {
                code: 'overview',
                title: 'Overview',
                submodules: [
                    {
                        code: 'dashboard',
                        title: 'CRM Dashboard',
                        description:
                            'New leads, pipeline by stage and open tickets at a glance.',
                        path: '/crm',
                        icon: 'barChart',
                    },
                    {
                        code: 'calendar',
                        title: 'Activity calendar',
                        description:
                            'Week and month view of calls, meetings and tasks (Asia/Manila).',
                        path: '/crm/calendar',
                        icon: 'calendar',
                        permissionCode: 'crm.activities',
                    },
                    {
                        code: 'customers',
                        title: 'Customers',
                        description:
                            'SD customers with their CRM 360° view — opportunities, tickets and loyalty.',
                        path: '/crm/customers',
                        icon: 'users',
                    },
                ],
            },
            {
                code: 'sales',
                title: 'Sales',
                submodules: [
                    {
                        code: 'leads',
                        title: 'Leads',
                        description:
                            'Capture and qualify prospects; convert them by linking an SD customer.',
                        path: '/crm/leads',
                        icon: 'userCircle',
                    },
                    {
                        code: 'opportunities',
                        title: 'Opportunities',
                        description:
                            'Track deals through pipeline stages in a table or board view.',
                        path: '/crm/opportunities',
                        icon: 'lineChart',
                    },
                ],
            },
            {
                code: 'service',
                title: 'Service',
                submodules: [
                    {
                        code: 'tickets',
                        title: 'Tickets',
                        description:
                            'Customer service cases with priorities, status and comments.',
                        path: '/crm/tickets',
                        icon: 'clipboard',
                    },
                ],
            },
            {
                code: 'communications',
                title: 'Communications',
                submodules: [
                    {
                        code: 'emails',
                        title: 'Emails',
                        description:
                            'Cover letters sent with quotations: subject, message, placeholders, default and active.',
                        path: '/emails',
                        icon: 'mail',
                        // Mail hub; messages for compose/sent, templates for cover letters.
                        permissionCode: 'emails.messages',
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
            'Goods in motion — demand planning, transportation execution, fleet telematics, and last-mile tracking.',
        path: '/modules/scm',
        icon: 'truck',
        categories: [
            {
                code: 'planning',
                title: 'Planning & Analytics',
                submodules: [
                    {
                        code: 'demand-planning',
                        title: 'Demand Plan',
                        description:
                            'Versioned demand by product × location × period. Horizon (operational / tactical / strategic) is a scope control on the plan.',
                        path: '/scm/demand-planning',
                        icon: 'lineChart',
                    },
                    {
                        code: 'supply-chain-dashboard',
                        title: 'Supply Chain Dashboard',
                        description:
                            'Ops KPIs — fleet utilization, shipments, trips; OTIF later.',
                        path: '/scm/supply-chain-dashboard',
                        icon: 'barChart',
                    },
                ],
            },
            {
                code: 'transportation',
                title: 'Transportation Management',
                submodules: [
                    {
                        code: 'shipments',
                        title: 'Shipments',
                        description: 'See all orders waiting to be delivered.',
                        path: '/scm/shipments',
                        icon: 'package',
                    },
                    {
                        code: 'load-building',
                        title: 'Load Building',
                        description:
                            'Choose what goes on each truck without overloading it.',
                        path: '/scm/load-building',
                        icon: 'layers',
                    },
                    {
                        code: 'trip-planning',
                        title: 'Trip Planning',
                        description:
                            'Turn a loaded truck into a trip, pick a driver, and send it out.',
                        path: '/scm/trip-planning',
                        icon: 'gitBranch',
                    },
                    {
                        code: 'trips',
                        title: 'Trips',
                        description: 'See every trip and where it stands.',
                        path: '/scm/trips',
                        icon: 'activity',
                    },
                    {
                        code: 'tracking',
                        title: 'Tracking',
                        description:
                            'See where your trucks are right now on a map.',
                        path: '/scm/tracking',
                        icon: 'activity',
                    },
                    {
                        code: 'consignments',
                        title: 'Consignments',
                        description:
                            'Parcels sent with third-party couriers and their tracking.',
                        path: '/scm/consignments',
                        icon: 'package',
                    },
                    {
                        code: 'vehicles',
                        title: 'Vehicles',
                        description: 'Add and manage your company trucks.',
                        path: '/scm/vehicles',
                        icon: 'truck',
                    },
                    {
                        code: 'drivers',
                        title: 'Drivers',
                        description: 'Add drivers and see who is available.',
                        path: '/scm/drivers',
                        icon: 'users',
                    },
                    {
                        code: 'maintenance',
                        title: 'Maintenance',
                        description:
                            'Schedule and record truck repairs and servicing.',
                        path: '/scm/maintenance',
                        icon: 'settings',
                    },
                    {
                        code: 'couriers',
                        title: 'Couriers',
                        description:
                            'Third-party couriers (3PL) we can ship with.',
                        path: '/scm/couriers',
                        icon: 'truck',
                    },
                ],
            },
        ],
    },
    {
        code: 'hcm',
        shortTitle: 'HCM',
        title: 'Human Capital Management',
        description:
            'HRIS — people, attendance, payroll, and workforce operations.',
        path: 'https://hris.agctek.co/',
        icon: 'users',
        isExternalLink: true,
        categories: [],
    },
    {
        code: 'wpd',
        shortTitle: 'WPD',
        title: 'Workforce Productivity Dashboard',
        description:
            'Workforce productivity KPIs and operational performance (opens in a new tab).',
        path: 'https://wpd.agctek.co/',
        icon: 'lineChart',
        isExternalLink: true,
        categories: [],
    },
]

/** Lookup helpers — use these instead of scanning the array directly */
export function getErpModule(code: string): ErpModule | undefined {
    return ERP_MODULES.find((m) => m.code === code)
}

export function getErpModuleByPath(pathname: string): ErpModule | undefined {
    return ERP_MODULES.find((m) => {
        if (m.isExternalLink) return false
        return pathname === m.path || pathname.startsWith(`${m.path}/`)
    })
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
            for (const submodule of category.submodules) {
                if (submodule.path === pathname) {
                    return { module, category, submodule }
                }

                for (const child of submodule.children ?? []) {
                    if (child.path === pathname) {
                        return { module, category, submodule, child }
                    }
                }
            }
        }
    }
    return undefined
}

/** App Router segment path for a submodule hub (always under /modules). */
export function erpSubmoduleRoutePath(
    moduleCode: string,
    submoduleCode: string,
) {
    return `/modules/${moduleCode}/${submoduleCode}`
}

/** App Router segment path for a nested feature under a submodule hub. */
export function erpFeatureRoutePath(
    moduleCode: string,
    submoduleCode: string,
    featureCode: string,
) {
    return `/modules/${moduleCode}/${submoduleCode}/${featureCode}`
}

/** Resolve submodule by URL segments (works when canonical path is /scm/* etc.). */
export function findSubmoduleByRoute(
    moduleCode: string,
    submoduleCode: string,
) {
    const module = getErpModule(moduleCode)
    if (!module) return undefined

    for (const category of module.categories) {
        for (const submodule of category.submodules) {
            if (submodule.code === submoduleCode) {
                return { module, category, submodule }
            }
        }
    }
    return undefined
}

/** Resolve nested feature by URL segments. */
export function findFeatureByRoute(
    moduleCode: string,
    submoduleCode: string,
    featureCode: string,
) {
    const base = findSubmoduleByRoute(moduleCode, submoduleCode)
    if (!base) return undefined

    const child = (base.submodule.children ?? []).find(
        (item) => item.code === featureCode,
    )
    if (!child) return undefined

    return { ...base, child }
}

/**
 * When a module uses non-/modules paths (SCM → /scm/*), map
 * /modules/scm/vehicles → child "vehicles" for redirect.
 */
export function findChildByRouteInModule(
    moduleCode: string,
    childCode: string,
) {
    const module = getErpModule(moduleCode)
    if (!module) return undefined

    for (const category of module.categories) {
        for (const submodule of category.submodules) {
            const child = (submodule.children ?? []).find(
                (item) => item.code === childCode,
            )
            if (child) {
                return { module, category, submodule, child }
            }
        }
    }
    return undefined
}

/** Permission resource guarding a submodule; null for external links (e.g. the public marketplace). */
export function submodulePermissionCode(
    moduleCode: string,
    submodule: Pick<ErpSubmodule, 'code' | 'permissionCode' | 'isExternalLink'>,
): string | null {
    if (submodule.permissionCode) return submodule.permissionCode
    if (submodule.isExternalLink) return null
    return `${moduleCode}.${submodule.code}`
}

/** Permission resource guarding a feature nested inside a submodule, e.g. `mm.procurement.rfqs`. */
export function featurePermissionCode(
    moduleCode: string,
    submodule: Pick<ErpSubmodule, 'code'>,
    feature: Pick<ErpSubmodule, 'code' | 'permissionCode'>,
): string {
    return (
        feature.permissionCode ??
        `${moduleCode}.${submodule.code}.${feature.code}`
    )
}

/** Permission resource of the deepest registry page containing `pathname` (detail routes included). */
export function permissionCodeForPath(pathname: string): string | null {
    const contains = (path: string) =>
        pathname === path || pathname.startsWith(`${path}/`)
    let bestPath = ''
    let bestCode: string | null = null
    for (const module of ERP_MODULES) {
        for (const category of module.categories) {
            for (const submodule of category.submodules) {
                if (contains(submodule.path) && submodule.path.length > bestPath.length) {
                    bestPath = submodule.path
                    bestCode = submodulePermissionCode(module.code, submodule)
                }
                for (const child of submodule.children ?? []) {
                    if (contains(child.path) && child.path.length > bestPath.length) {
                        bestPath = child.path
                        bestCode = featurePermissionCode(module.code, submodule, child)
                    }
                }
            }
        }
    }
    return bestCode
}

export function submoduleHasChildren(submodule: { children?: unknown[] }) {
    return Boolean(submodule.children && submodule.children.length > 0)
}

export function getNestedSubmoduleStaticParams() {
    return getResolvedErpModules().flatMap((module) =>
        module.categories.flatMap((category) =>
            category.submodules.flatMap((submodule) => {
                if (!submoduleHasChildren(submodule)) {
                    return []
                }

                return (submodule.children ?? []).map((child) => ({
                    moduleCode: module.code,
                    submoduleCode: submodule.code,
                    featureCode: child.code,
                }))
            }),
        ),
    )
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
