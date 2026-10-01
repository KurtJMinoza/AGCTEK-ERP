'use client'

import { useCallback, useEffect, useMemo } from 'react'
import type { SdProductRecord } from '../services/productCatalogService'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

const NO_PRODUCTS: SdProductRecord[] = []

/**
 * Active SD products of one division, mapped to the caller's view type.
 * `map` must be stable (module-level function) to avoid re-mapping every render.
 */
export function useDivisionProducts<T>(
    divisionId: string,
    map: (record: SdProductRecord) => T,
) {
    const catalog = useProductCatalogStore((s) => s.catalogs[divisionId])
    const ensureLoaded = useProductCatalogStore((s) => s.ensureLoaded)

    useEffect(() => {
        ensureLoaded(divisionId).catch(() => undefined)
    }, [divisionId, ensureLoaded])

    const records = catalog?.products ?? NO_PRODUCTS
    const products = useMemo(() => records.map(map), [records, map])
    const reload = useCallback(
        () => ensureLoaded(divisionId, { force: true }).catch(() => undefined),
        [divisionId, ensureLoaded],
    )

    return {
        products,
        /** Raw records; also the dependency to recompute SD pricing on catalog changes. */
        records,
        ready: catalog?.products != null,
        loading: !catalog?.products && (catalog?.loading ?? true),
        error: catalog?.products ? null : (catalog?.error ?? null),
        reload,
    }
}
