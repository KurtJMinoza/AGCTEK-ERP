import type { BreadcrumbItem } from '@/components/shared/Breadcrumb'
import appConfig from '@/configs/app.config'
import { ACTIVITY_LOG_PATH } from '@/constants/route.constant'
import type { ErpModule, ErpNavSearchResult } from '@/types/erp-modules'
import { getResolvedErpModules } from '@/configs/erp-modules'

const homeBreadcrumb = (): BreadcrumbItem => ({
    label: 'Home',
    href: appConfig.authenticatedEntryPath,
})

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase()
}

function matchesText(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle)
}

/**
 * Filters modules and submodules for sidebar search.
 * Searches module short title, full title, submodule titles, and descriptions.
 */
export function searchErpNavigation(
    query: string,
    modules: ErpModule[] = getResolvedErpModules(),
): ErpNavSearchResult[] {
    const q = normalizeQuery(query)
    if (!q) return modules.map((module) => ({ type: 'module', module }))

    const results: ErpNavSearchResult[] = []
    const seenModules = new Set<string>()

    for (const module of modules) {
        const moduleMatches =
            matchesText(module.shortTitle, q) ||
            matchesText(module.title, q) ||
            matchesText(module.description, q)

        if (moduleMatches && !seenModules.has(module.code)) {
            results.push({ type: 'module', module })
            seenModules.add(module.code)
        }

        for (const category of module.categories) {
            if (matchesText(category.title, q) && !seenModules.has(module.code)) {
                results.push({ type: 'module', module })
                seenModules.add(module.code)
            }

            for (const submodule of category.submodules) {
                const submoduleMatches =
                    matchesText(submodule.title, q) ||
                    matchesText(submodule.description, q) ||
                    matchesText(submodule.code, q)

                if (submoduleMatches) {
                    results.push({
                        type: 'submodule',
                        module,
                        category,
                        submodule,
                    })
                }

                for (const child of submodule.children ?? []) {
                    const childMatches =
                        matchesText(child.title, q) ||
                        matchesText(child.description, q) ||
                        matchesText(child.code, q)

                    if (childMatches) {
                        results.push({
                            type: 'submodule',
                            module,
                            category,
                            submodule: child,
                        })
                    }
                }
            }
        }
    }

    return results
}

export function getActiveModuleCode(pathname: string): string | undefined {
    const modules = getResolvedErpModules()
    const match = modules.find(
        (m) => pathname === m.path || pathname.startsWith(`${m.path}/`),
    )
    return match?.code
}

/**
 * Builds breadcrumb trail for home, activity log, module landing, and submodule pages.
 */
export function buildErpBreadcrumbs(pathname: string): BreadcrumbItem[] {
    const home = appConfig.authenticatedEntryPath

    if (pathname === home || pathname === '/') {
        return [{ label: 'Home' }]
    }

    if (pathname === ACTIVITY_LOG_PATH) {
        return [homeBreadcrumb(), { label: 'Activity Log' }]
    }

    const modules = getResolvedErpModules()

    for (const module of modules) {
        for (const category of module.categories) {
            for (const submodule of category.submodules) {
                for (const child of submodule.children ?? []) {
                    if (child.path === pathname) {
                        const crumbs: BreadcrumbItem[] = [
                            homeBreadcrumb(),
                            { label: module.title, href: module.path },
                            { label: category.title },
                            {
                                label: submodule.title,
                                href: submodule.path,
                            },
                        ]

                        if (submodule.childGroupTitle) {
                            crumbs.push({ label: submodule.childGroupTitle })
                        }

                        crumbs.push({ label: child.title })
                        return crumbs
                    }
                }

                if (submodule.path === pathname) {
                    return [
                        homeBreadcrumb(),
                        { label: module.title, href: module.path },
                        { label: category.title },
                        { label: submodule.title },
                    ]
                }
            }
        }
    }

    const module = modules.find((item) => item.path === pathname)
    if (module) {
        return [homeBreadcrumb(), { label: module.title }]
    }

    return [homeBreadcrumb()]
}
