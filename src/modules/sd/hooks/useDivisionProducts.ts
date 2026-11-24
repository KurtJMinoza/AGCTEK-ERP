'use client'

import { useCallback, useEffect, useMemo } from 'react'
import type { SdProductRecord } from '../services/productCatalogService'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

const NO_PRODUCTS: SdProductRecord[] = []

const cacheKey = (divisionId: string, companyId?: string | null) =>
    companyId?.trim() ? `${divisionId}::${companyId.trim()}` : divisionId

/**
 * Active SD products of one division, mapped to the caller's view type.
 * `map` must be stable (module-level function) to avoid re-mapping every render.
 * Pass `companyId` for POS so only that company's catalog is sellable.
 */
export function useDivisionProducts<T>(
    divisionId: string,
    map: (record: SdProductRecord) => T,
    companyId?: string | null,
) {
    const key = cacheKey(divisionId, companyId)
    const catalog = useProductCatalogStore((s) => s.catalogs[key])
    const ensureLoaded = useProductCatalogStore((s) => s.ensureLoaded)

    useEffect(() => {
        if (!divisionId) return
        // Wait for company scope on POS; avoid loading the unscoped catalog.
        if (companyId !== undefined && !companyId) return
        ensureLoaded(divisionId, { companyId }).catch(() => undefined)
    }, [divisionId, companyId, ensureLoaded])

    const records = catalog?.products ?? NO_PRODUCTS
    const products = useMemo(() => records.map(map), [records, map])
    const reload = useCallback(
        () =>
            ensureLoaded(divisionId, { force: true, companyId }).catch(
                () => undefined,
            ),
        [divisionId, companyId, ensureLoaded],
    )

    const waitingForCompany =
        companyId !== undefined && !companyId

    return {
        products,
        /** Raw records; also the dependency to recompute SD pricing on catalog changes. */
        records,
        ready: !waitingForCompany && catalog?.products != null,
        loading:
            waitingForCompany ||
            (!catalog?.products && (catalog?.loading ?? true)),
        error: catalog?.products ? null : (catalog?.error ?? null),
        reload,
    }
}
