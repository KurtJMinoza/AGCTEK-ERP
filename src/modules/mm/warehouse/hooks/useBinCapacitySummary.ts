'use client'

import { useState, useEffect, useCallback } from 'react'
import { storageBinService } from '../services/storageBinService'
import type { BinCapacitySummary } from '../types'

export function useBinCapacitySummary(warehouseId?: string) {
    const [data, setData] = useState<BinCapacitySummary | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await storageBinService.getCapacitySummary(
                warehouseId ? { warehouseId } : undefined,
            )
            setData(res)
        } catch (err) {
            console.error('Failed to fetch bin capacity summary', err)
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [warehouseId])

    useEffect(() => { fetchData() }, [fetchData])

    return { data, loading, refresh: fetchData }
}
