import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

const crmRoot = (): BreadcrumbItem => ({ label: 'CRM', href: '/crm' })

export function crmDashboardBreadcrumbs(): BreadcrumbItem[] {
    return [{ label: 'CRM' }]
}

export function crmPageBreadcrumbs(pageLabel: string): BreadcrumbItem[] {
    return [crmRoot(), { label: pageLabel }]
}

export function crmOpportunityBreadcrumbs(name: string): BreadcrumbItem[] {
    return [crmRoot(), { label: 'Opportunities', href: '/crm/opportunities' }, { label: name }]
}

export function crmCustomerBreadcrumbs(companyName: string): BreadcrumbItem[] {
    return [crmRoot(), { label: 'Customers', href: '/crm/customers' }, { label: companyName }]
}
