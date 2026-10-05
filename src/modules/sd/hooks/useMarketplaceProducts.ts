'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { SdProductRecord } from '../services/productCatalogService'
import { SALES_DIVISION_IDS } from '../services/pricingEngine'
import { useProductCatalogStore } from '../store/useProductCatalogStore'

/** Active SD products of every storefront division, in division then catalog order. */
export function useMarketplaceProducts() {
    const divisionCatalogs = useProductCatalogStore(
        useShallow((s) => SALES_DIVISION_IDS.map((id) => s.catalogs[id])),
    )
    const ensureAllLoaded = useProductCatalogStore((s) => s.ensureAllLoaded)

    useEffect(() => {
        ensureAllLoaded(SALES_DIVISION_IDS).catch(() => undefined)
    }, [ensureAllLoaded])

    const ready = divisionCatalogs.every((catalog) => catalog?.products != null)
    const records = useMemo<SdProductRecord[]>(
        () => divisionCatalogs.flatMap((catalog) => catalog?.products ?? []),
        [divisionCatalogs],
    )
    const reload = useCallback(
        () => ensureAllLoaded(SALES_DIVISION_IDS, { force: true }).catch(() => undefined),
        [ensureAllLoaded],
    )

    return {
        /** Also the dependency to recompute SD pricing on catalog changes. */
        records,
        ready,
        loading: !ready && divisionCatalogs.some((catalog) => catalog?.loading ?? true),
        error: ready
            ? null
            : (divisionCatalogs.find((catalog) => catalog?.error)?.error ?? null),
        reload,
    }
}
