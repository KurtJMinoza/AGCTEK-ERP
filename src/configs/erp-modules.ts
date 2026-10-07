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
                            'Open the AGC Marketplace — the customer-facing online store for AWIC, MCONPINCO and LPG.',
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
                ],
            },
            {
                code: 'configuration',
                title: 'Configuration',
                submodules: [
                    {
                        code: 'sales-org',
                        permissionCode: 'sd.configuration',
                        title: 'Sales Organization',
                        description:
                            'Configure sales orgs, distribution channels, and divisions.',
                        path: '/modules/sd/sales-org',
                        icon: 'building',
                    },
                    {
                        code: 'document-types',
                        permissionCode: 'sd.configuration',
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
                        permissionCode: 'fico.reports',
                        title: 'Financial Statements',
                        description:
                            'Balance sheet, P&L, and cash flow reports.',
                        path: '/modules/fico/financial-statements',
                        icon: 'fileSpreadsheet',
                    },
                    {
                        code: 'cost-center-reporting',
                        permissionCode: 'fico.reports',
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
                        permissionCode: 'fico.configuration',
                        title: 'Fiscal Year Variant',
                        description:
                            'Define posting periods and fiscal year structure.',
                        path: '/modules/fico/fiscal-year-variant',
                        icon: 'calendar',
                    },
                    {
                        code: 'document-types-fi',
                        permissionCode: 'fico.configuration',
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
