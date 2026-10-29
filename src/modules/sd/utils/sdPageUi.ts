import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'

/** Parent trail for PageHeader (excludes current page title). */
export function sdParentBreadcrumbs(routePath: string): BreadcrumbItem[] {
    const items = buildErpBreadcrumbs(routePath)
    return items.length > 1 ? items.slice(0, -1) : items
}
