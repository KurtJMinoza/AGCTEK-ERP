'use client'

import { useEffect, useMemo, useState } from 'react'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { orgService, uomService } from '@/modules/mm/material-master/services/referenceService'
import { warehouseService } from '@/modules/mm/warehouse/services/warehouseService'

export type EntityOpt = { value: string; label: string; meta?: Record<string, any> }

/**
 * Load searchable Select options for materials / suppliers used across MM forms.
 */
export function useMaterialOptions(params?: { limit?: number; enabled?: boolean }) {
    const enabled = params?.enabled === true
    const limit = params?.limit ?? 100
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        materialService
            .list({ page: 1, limit, status: 'ACTIVE' } as any)
            .then((res: any) => {
                if (cancelled) return
                const list = Array.isArray(res) ? res : res?.data ?? []
                setOptions(
                    list.map((m: any) => ({
                        value: m.id,
                        label: `${m.materialCode} — ${m.materialName}`,
                        meta: m,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled, limit])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}

export function useSupplierOptions(params?: { limit?: number; enabled?: boolean }) {
    const enabled = params?.enabled === true
    const limit = params?.limit ?? 100
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        supplierService
            .list({ page: 1, pageSize: limit } as any)
            .then((res: any) => {
                if (cancelled) return
                const list = Array.isArray(res) ? res : res?.data ?? []
                setOptions(
                    list.map((s: any) => ({
                        value: s.id,
                        label: `${s.supplierCode} — ${s.supplierName}`,
                        meta: s,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled, limit])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}

export function useWarehouseOptions(params?: { limit?: number; enabled?: boolean }) {
    const enabled = params?.enabled === true
    const limit = params?.limit ?? 200
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        warehouseService
            .list({ limit, status: 'ACTIVE' } as any)
            .then((res: any) => {
                if (cancelled) return
                const list = Array.isArray(res) ? res : res?.data ?? []
                setOptions(
                    list.map((w: any) => ({
                        value: w.id,
                        label: `${w.code} — ${w.name}`,
                        meta: w,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled, limit])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}

export function useCompanyOptions(params?: { enabled?: boolean }) {
    const enabled = params?.enabled === true
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        orgService
            .companies()
            .then((list) => {
                if (cancelled) return
                setOptions(list.map((c) => ({ value: c.id, label: c.name, meta: c })))
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}

export function useUomOptions(params?: { enabled?: boolean }) {
    const enabled = params?.enabled === true
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        uomService
            .list()
            .then((list) => {
                if (cancelled) return
                setOptions(list.map((u) => ({ value: u.id, label: u.code, meta: u })))
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}

export function useCurrencyOptions(params?: { enabled?: boolean }) {
    const enabled = params?.enabled === true
    const [options, setOptions] = useState<EntityOpt[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        setLoading(true)
        orgService
            .currencies()
            .then((list) => {
                if (cancelled) return
                setOptions(
                    list.map((c) => ({
                        value: c.id,
                        label: `${c.code}${c.name ? ` — ${c.name}` : ''}`,
                        meta: c,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setOptions([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled])

    const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
    return { options, byId, loading }
}
