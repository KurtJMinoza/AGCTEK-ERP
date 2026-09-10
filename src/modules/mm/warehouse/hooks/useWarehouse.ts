'use client'

import { useState, useEffect, useCallback } from 'react'
import { warehouseService } from '../services/warehouseService'
import type { Warehouse } from '../types'

export function useWarehouse(id: string | null) {
    const [data, setData] = useState<Warehouse | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        if (!id) { setData(null); return }
        setLoading(true)
        try {
            const res = await warehouseService.get(id)
            setData(res)
        } catch (err) {
            console.error('Failed to fetch warehouse', err)
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchData() }, [fetchData])

    return { data, loading, refresh: fetchData }
}
