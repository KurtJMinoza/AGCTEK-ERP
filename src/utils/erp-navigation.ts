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
 * Removes consecutive breadcrumb items that share the same label to avoid
 * redundant chains like "Materials Management / Materials Management" or
 * "Material Master / Material Master / Material Master".
 *
 * Preference: when two adjacent items have the same label, keep the one with
 * an href (clickable) over one without.
 */
function dedupeAdjacentBreadcrumbs(
    items: BreadcrumbItem[],
): BreadcrumbItem[] {
    const result: BreadcrumbItem[] = []
    for (const item of items) {
        const prev = result[result.length - 1]
        if (prev && prev.label === item.label) {
            if (!prev.href && item.href) {
                result[result.length - 1] = item
            }
            continue
        }
        result.push(item)
    }
    return result
}

export type BuildErpBreadcrumbsOptions = {
    /** Final segment for detail routes (e.g. document number on a /[id] page). */
    detailLabel?: string
}

type NavChildMatch = {
    kind: 'child'
    module: ErpModule
    category: ErpModule['categories'][number]
    submodule: ErpModule['categories'][number]['submodules'][number]
    child: NonNullable<
        ErpModule['categories'][number]['submodules'][number]['children']
    >[number]
}

type NavSubmoduleMatch = {
    kind: 'submodule'
    module: ErpModule
    category: ErpModule['categories'][number]
    submodule: ErpModule['categories'][number]['submodules'][number]
}

type NavMatch = NavChildMatch | NavSubmoduleMatch

function buildCrumbsFromNavMatch(
    match: NavMatch,
    options?: BuildErpBreadcrumbsOptions,
): BreadcrumbItem[] {
    const { module, category, submodule } = match
    const crumbs: BreadcrumbItem[] = [
        homeBreadcrumb(),
        { label: module.title, href: module.path },
        { label: category.title },
        { label: submodule.title, href: submodule.path },
    ]

    if (match.kind === 'child') {
        if (submodule.childGroupTitle) {
            crumbs.push({ label: submodule.childGroupTitle })
        }

        const detailLabel = options?.detailLabel?.trim()
        crumbs.push({
            label: match.child.title,
            href: detailLabel ? match.child.path : undefined,
        })

        if (detailLabel) {
            crumbs.push({ label: detailLabel })
        }
    } else if (options?.detailLabel?.trim()) {
        crumbs.push({ label: options.detailLabel.trim() })
    }

    return dedupeAdjacentBreadcrumbs(crumbs)
}

function findNavMatch(
    pathname: string,
    modules: ErpModule[],
): NavMatch | undefined {
    type Candidate = { path: string; match: NavMatch }
    const candidates: Candidate[] = []

    for (const module of modules) {
        for (const category of module.categories) {
            for (const submodule of category.submodules) {
                if (submodule.path) {
                    candidates.push({
                        path: submodule.path,
                        match: { kind: 'submodule', module, category, submodule },
                    })
                }

                for (const child of submodule.children ?? []) {
                    if (child.path) {
                        candidates.push({
                            path: child.path,
                            match: {
                                kind: 'child',
                                module,
                                category,
                                submodule,
                                child,
                            },
                        })
                    }
                }
            }
        }
    }

    candidates.sort((a, b) => b.path.length - a.path.length)

    for (const { path, match } of candidates) {
        if (pathname === path || pathname.startsWith(`${path}/`)) {
            return match
        }
    }

    return undefined
}

/**
 * Builds breadcrumb trail for home, activity log, module landing, submodule pages,
 * and detail routes under a registered nav path (longest prefix match).
 */
export function buildErpBreadcrumbs(
    pathname: string,
    options?: BuildErpBreadcrumbsOptions,
): BreadcrumbItem[] {
    const home = appConfig.authenticatedEntryPath

    if (pathname === home || pathname === '/') {
        return [{ label: 'Home' }]
    }

    if (pathname === ACTIVITY_LOG_PATH) {
        return [homeBreadcrumb(), { label: 'Activity Log' }]
    }

    const modules = getResolvedErpModules()
    const navMatch = findNavMatch(pathname, modules)

    if (navMatch?.kind === 'child') {
        return buildCrumbsFromNavMatch(navMatch, options)
    }

    if (navMatch?.kind === 'submodule') {
        if (navMatch.submodule.path === pathname) {
            return dedupeAdjacentBreadcrumbs([
                homeBreadcrumb(),
                { label: navMatch.module.title, href: navMatch.module.path },
                { label: navMatch.category.title },
                { label: navMatch.submodule.title },
            ])
        }

        return buildCrumbsFromNavMatch(navMatch, options)
    }

    const module = modules.find(
        (item) => item.path === pathname || pathname.startsWith(`${item.path}/`),
    )
    if (module) {
        const crumbs: BreadcrumbItem[] = [
            homeBreadcrumb(),
            { label: module.title, href: module.path },
        ]
        const detailLabel = options?.detailLabel?.trim()
        if (detailLabel) {
            crumbs.push({ label: detailLabel })
        }
        return dedupeAdjacentBreadcrumbs(crumbs)
    }

    return [homeBreadcrumb()]
}
