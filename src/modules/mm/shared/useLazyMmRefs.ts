'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { warehouseService } from '@/modules/mm/warehouse/services/warehouseService'
import { storageBinService } from '@/modules/mm/warehouse/services/storageBinService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { orgService, uomService } from '@/modules/mm/material-master/services/referenceService'
import type { Warehouse } from '@/modules/mm/warehouse/types'
import type { Material } from '@/modules/mm/material-master/types'
import type { StorageBin } from '@/modules/mm/warehouse/types'
import { getApiErrorMessage } from '@/modules/mm/shared/apiError'

export type MmOpt = { value: string; label: string; meta?: Record<string, unknown> }

export type MmRefKey =
    | 'companies'
    | 'currencies'
    | 'warehouses'
    | 'materials'
    | 'suppliers'
    | 'uoms'
    | 'bins'

const LOADERS: Record<MmRefKey, () => Promise<MmOpt[]>> = {
    companies: async () => {
        const list = await orgService.companies()
        return list.map((c) => ({ value: c.id, label: c.name }))
    },
    currencies: async () => {
        const list = await orgService.currencies()
        return list.map((c) => ({
            value: c.id,
            label: `${c.code}${c.name ? ` — ${c.name}` : ''}`,
        }))
    },
    warehouses: async () => {
        const res = await warehouseService.list({ limit: 200 })
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        return list.map((w: Warehouse) => ({
            value: w.id,
            label: `${w.code} — ${w.name}`,
            meta: w as unknown as Record<string, unknown>,
        }))
    },
    materials: async () => {
        const res = await materialService.list({ page: 1, limit: 200, status: 'ACTIVE' } as never)
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        return list.map((m: Material) => ({
            value: m.id,
            label: `${m.materialCode} — ${m.materialName}`,
            meta: m as unknown as Record<string, unknown>,
        }))
    },
    suppliers: async () => {
        const res = await supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' })
        return res.data.map((s) => ({
            value: s.id,
            label: `${s.supplierCode} — ${s.supplierName}`,
        }))
    },
    uoms: async () => {
        const list = await uomService.list()
        return list.map((u) => ({ value: u.id, label: u.code }))
    },
    bins: async () => {
        const res = await storageBinService.list({ limit: 200 })
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        return list.map((b: StorageBin) => ({ value: b.id, label: b.code }))
    },
}

/**
 * Lazy-load MM form/filter reference data. Call `ensure(...keys)` when a dialog
 * opens or when filter dropdowns are first needed — avoids 3–6 API calls on
 * every list-page mount.
 */
export function useLazyMmRefs() {
    const cacheRef = useRef<Partial<Record<MmRefKey, MmOpt[]>>>({})
    const inflightRef = useRef<Partial<Record<MmRefKey, Promise<MmOpt[]>>>>({})
    const [snap, setSnap] = useState<Partial<Record<MmRefKey, MmOpt[]>>>({})
    const [loading, setLoading] = useState(false)

    const ensure = useCallback(async (...keys: MmRefKey[]) => {
        const missing = [...new Set(keys)].filter((k) => !cacheRef.current[k])
        if (!missing.length) return cacheRef.current

        setLoading(true)
        try {
            await Promise.all(
                missing.map(async (key) => {
                    if (inflightRef.current[key]) {
                        cacheRef.current[key] = await inflightRef.current[key]!
                        return
                    }
                    const p = LOADERS[key]()
                    inflightRef.current[key] = p
                    try {
                        cacheRef.current[key] = await p
                    } catch (err) {
                        cacheRef.current[key] = []
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(
                                `[useLazyMmRefs] ${key}:`,
                                getApiErrorMessage(err, 'Load failed'),
                            )
                        }
                    } finally {
                        delete inflightRef.current[key]
                    }
                }),
            )
            setSnap({ ...cacheRef.current })
        } finally {
            setLoading(false)
        }
        return cacheRef.current
    }, [])

    return {
        ensure,
        loading,
        companies: snap.companies ?? [],
        currencies: snap.currencies ?? [],
        warehouses: snap.warehouses ?? [],
        materials: snap.materials ?? [],
        suppliers: snap.suppliers ?? [],
        uoms: snap.uoms ?? [],
        bins: snap.bins ?? [],
    }
}

/** Full warehouse rows for stock-ops forms that need companyId from warehouse. */
export function useLazyWarehouseEntities() {
    const cache = useRef<Warehouse[] | null>(null)
    const [rows, setRows] = useState<Warehouse[]>([])
    const [loading, setLoading] = useState(false)

    const ensure = useCallback(async () => {
        if (cache.current?.length) return cache.current
        setLoading(true)
        try {
            const res = await warehouseService.list({ limit: 200 })
            const list = Array.isArray(res) ? res : (res?.data ?? [])
            cache.current = list
            setRows(list)
            return list
        } finally {
            setLoading(false)
        }
    }, [])

    return { ensure, rows, loading }
}

/** Full material rows for stock-ops line defaults (baseUomId, etc.). */
export function useLazyMaterialEntities() {
    const cache = useRef<Material[] | null>(null)
    const [rows, setRows] = useState<Material[]>([])
    const [loading, setLoading] = useState(false)

    const ensure = useCallback(async () => {
        if (cache.current?.length) return cache.current
        setLoading(true)
        try {
            const res = await materialService.list({ limit: 200, status: 'ACTIVE' } as never)
            const list = Array.isArray(res) ? res : (res?.data ?? [])
            cache.current = list
            setRows(list)
            return list
        } finally {
            setLoading(false)
        }
    }, [])

    return { ensure, rows, loading }
}

/** Defer filter dropdown options until after the primary list fetch starts. */
export function useDeferredFilterRefs(...keys: MmRefKey[]) {
    const refs = useLazyMmRefs()
    const ensureRef = useRef(refs.ensure)
    ensureRef.current = refs.ensure
    const loaded = useRef(false)
    const keyStr = keys.join(',')

    // Do not depend on `refs` — snap/loading updates recreate that object and
    // would retrigger any effect that lists loadFilterRefs (infinite list fetch loop).
    const loadFilterRefs = useCallback(() => {
        if (loaded.current) return
        loaded.current = true
        void ensureRef.current(...(keyStr.split(',') as MmRefKey[]))
    }, [keyStr])

    return { ...refs, loadFilterRefs }
}

/** Filter pages: defer reference dropdowns until after first paint (list fetch is not blocked). */
export function useMmFilterRefs(...keys: MmRefKey[]) {
    const deferred = useDeferredFilterRefs(...keys)
    useEffect(() => {
        const t = window.setTimeout(() => deferred.loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [deferred.loadFilterRefs])
    return deferred
}

/** Bins for a selected warehouse — loaded when warehouse is chosen or form opens. */
export function useLazyBinsForWarehouse() {
    const cache = useRef<Map<string, StorageBin[]>>(new Map())
    const [rows, setRows] = useState<StorageBin[]>([])
    const [loading, setLoading] = useState(false)

    const loadForWarehouse = useCallback(async (warehouseId: string) => {
        if (!warehouseId) {
            setRows([])
            return []
        }
        const cached = cache.current.get(warehouseId)
        if (cached) {
            setRows(cached)
            return cached
        }
        setLoading(true)
        try {
            const res = await storageBinService.list({ limit: 200, warehouseId })
            const list = Array.isArray(res) ? res : (res?.data ?? [])
            cache.current.set(warehouseId, list)
            setRows(list)
            return list
        } finally {
            setLoading(false)
        }
    }, [])

    return { loadForWarehouse, rows, loading }
}

/** Org plants/branches for warehouse/branch forms. */
export function useLazyOrgRefs() {
    const cache = useRef<{ plants?: MmOpt[]; branches?: MmOpt[] }>({})
    const [plants, setPlants] = useState<MmOpt[]>([])
    const [branches, setBranches] = useState<MmOpt[]>([])
    const [loading, setLoading] = useState(false)

    const ensure = useCallback(async (...keys: Array<'plants' | 'branches'>) => {
        const missing = keys.filter((k) => !cache.current[k]?.length)
        if (!missing.length) return cache.current
        setLoading(true)
        try {
            await Promise.all(
                missing.map(async (key) => {
                    if (key === 'plants') {
                        const list = await orgService.plants({ activeOnly: true })
                        cache.current.plants = list.map((p) => ({
                            value: p.id,
                            label: p.name || p.code,
                        }))
                        setPlants(cache.current.plants)
                    } else {
                        const list = await orgService.branches({ activeOnly: true })
                        cache.current.branches = list.map((b) => ({
                            value: b.id,
                            label: b.name || b.code,
                        }))
                        setBranches(cache.current.branches)
                    }
                }),
            )
        } finally {
            setLoading(false)
        }
        return cache.current
    }, [])

    return { ensure, plants, branches, loading }
}
