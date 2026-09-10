'use client'

import { useEffect, useMemo, useState } from 'react'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'

export type EntityOpt = { value: string; label: string; meta?: Record<string, any> }

/**
 * Load searchable Select options for materials / suppliers used across MM forms.
 */
export function useMaterialOptions(params?: { limit?: number; enabled?: boolean }) {
    const enabled = params?.enabled !== false
    const limit = params?.limit ?? 500
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
    const enabled = params?.enabled !== false
    const limit = params?.limit ?? 500
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
