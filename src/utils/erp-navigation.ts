import type { ErpModule, ErpNavSearchResult } from '@/types/erp-modules'
import { getResolvedErpModules } from '@/configs/erp-modules'

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
