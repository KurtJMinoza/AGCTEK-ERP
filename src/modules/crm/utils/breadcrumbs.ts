import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const OPPORTUNITIES_PATH = '/crm/opportunities'
const CUSTOMERS_PATH = '/crm/customers'

/** Home › Customer Relationship Management › Overview › CRM Dashboard (from the module registry). */
export function crmDashboardBreadcrumbs(): BreadcrumbItem[] {
    return buildErpBreadcrumbs('/crm')
}

/** Registry trail for a CRM list page, e.g. `/crm/leads` → Home › CRM › Sales › Leads. */
export function crmPageBreadcrumbs(path: string): BreadcrumbItem[] {
    return buildErpBreadcrumbs(path)
}

export function crmOpportunityBreadcrumbs(name: string, id = 'detail'): BreadcrumbItem[] {
    return buildErpBreadcrumbs(`${OPPORTUNITIES_PATH}/${encodeURIComponent(id)}`, { detailLabel: name })
}

export function crmQuotationBreadcrumbs(
    opportunityName: string,
    opportunityId: string,
    quotationLabel: string,
): BreadcrumbItem[] {
    if (!opportunityId) return [...buildErpBreadcrumbs(`${OPPORTUNITIES_PATH}/detail`), { label: quotationLabel }]
    const opportunityHref = `${OPPORTUNITIES_PATH}/${encodeURIComponent(opportunityId)}`
    const trail = buildErpBreadcrumbs(opportunityHref, { detailLabel: opportunityName || 'Opportunity' })
    const last = trail[trail.length - 1]
    return [...trail.slice(0, -1), { ...last, href: opportunityHref }, { label: quotationLabel }]
}

export function crmCustomerBreadcrumbs(companyName: string, id = 'detail'): BreadcrumbItem[] {
    return buildErpBreadcrumbs(`${CUSTOMERS_PATH}/${encodeURIComponent(id)}`, { detailLabel: companyName })
}
