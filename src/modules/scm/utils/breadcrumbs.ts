import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'
import { getErpModule } from '@/configs/erp-modules'

export type ScmBreadcrumbSection = 'transportation' | 'planning' | 'reports'

const scmRoot = (): BreadcrumbItem => {
    const module = getErpModule('scm')
    return {
        label: 'SCM',
        href: module?.path ?? '/modules/scm',
    }
}

const transportationHub = (): BreadcrumbItem => ({
    label: 'Transportation',
    href: '/scm',
})

/** Transportation Management hub (`/scm`). */
export function scmDashboardBreadcrumbs(): BreadcrumbItem[] {
    return [scmRoot(), { label: 'Transportation Management' }]
}

/**
 * Breadcrumbs for SCM pages.
 * - transportation (default): SCM → Transportation → page
 * - planning / reports: SCM → page (no Transportation redirect)
 */
export function scmPageBreadcrumbs(
    pageLabel: string,
    section: ScmBreadcrumbSection = 'transportation',
): BreadcrumbItem[] {
    if (section === 'planning' || section === 'reports') {
        return [scmRoot(), { label: pageLabel }]
    }

    return [scmRoot(), transportationHub(), { label: pageLabel }]
}

/** Vehicle detail under the Transportation fleet list. */
export function scmVehicleBreadcrumbs(plateNumber: string): BreadcrumbItem[] {
    return [
        scmRoot(),
        transportationHub(),
        { label: 'Vehicles', href: '/scm/vehicles' },
        { label: plateNumber },
    ]
}
