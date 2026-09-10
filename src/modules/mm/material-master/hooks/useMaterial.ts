'use client'

import { useState, useEffect, useCallback } from 'react'
import { materialService } from '../services/materialService'
import type { Material } from '../types'

export function useMaterial(id: string | null) {
    const [data, setData] = useState<Material | null>(null)
    const [loading, setLoading] = useState(false)

    const fetchData = useCallback(async () => {
        if (!id) { setData(null); return }
        setLoading(true)
        try {
            const res = await materialService.get(id)
            setData(res)
        } catch (err) {
            console.error('Failed to fetch material', err)
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchData() }, [fetchData])

    return { data, loading, refresh: fetchData }
}
