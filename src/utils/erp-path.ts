/** Canonical MM Materials / SKUs list (Material Master). */
export const MM_MATERIALS_SKUS_PATH =
    '/modules/mm/material-master/materials-skus'

/**
 * Fixes common broken ERP URLs (relative links pasted without a leading `/`,
 * or `materials-skus` glued to `modules/...`).
 */
export function repairErpModulePath(pathname: string): string | undefined {
    if (pathname.includes('materials-skusmodules/')) {
        return MM_MATERIALS_SKUS_PATH
    }

    /** e.g. /modules/sd/product-catalog/modules/mm/material-master/materials-skus */
    const embedded = pathname.match(/^\/modules\/[^/]+\/[^/]+\/modules\/(.+)$/)
    if (embedded?.[1]) {
        const target = `/modules/${embedded[1].replace(/\/+$/, '')}`
        return target.length > '/modules'.length ? target : undefined
    }

    return undefined
}
