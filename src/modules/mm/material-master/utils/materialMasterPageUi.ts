import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

/** Hub tagline from ERP navigation (Material Master). */
export const MATERIAL_MASTER_HUB_DESCRIPTION =
    'Materials, SKUs, units, barcodes, batches, and serial tracking.'

export function materialMasterParentBreadcrumbs(routePath: string): BreadcrumbItem[] {
    const items = buildErpBreadcrumbs(routePath)
    return items.length > 1 ? items.slice(0, -1) : items
}

export function materialMasterFeatureDescription(featureTitle: string): string {
    return `Material Master — ${featureTitle}.`
}
