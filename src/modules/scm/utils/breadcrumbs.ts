import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

const scmRoot: BreadcrumbItem = {
    label: 'SCM',
    href: '/modules/scm',
}

const transportation: BreadcrumbItem = {
    label: 'Transportation',
    href: '/scm',
}

/** Breadcrumbs for the SCM Transportation Management dashboard. */
export function scmDashboardBreadcrumbs(): BreadcrumbItem[] {
    return [scmRoot, { label: 'Transportation Management' }]
}

/** Breadcrumbs for SCM Transportation child pages. */
export function scmPageBreadcrumbs(pageLabel: string): BreadcrumbItem[] {
    return [scmRoot, transportation, { label: pageLabel }]
}
