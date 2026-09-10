'use client'

import { useEffect, useState } from 'react'
import { uomService } from '@/modules/mm/material-master/services/referenceService'
import type { MmUom } from '@/modules/mm/material-master/types'

export function useUoms(enabled = true) {
    const [uoms, setUoms] = useState<MmUom[]>([])
    const [loading, setLoading] = useState(enabled)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        uomService
            .list()
            .then((list) => {
                if (!cancelled) setUoms(list)
            })
            .catch((err) => {
                console.error('Failed to load UOMs', err)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [enabled])

    return { uoms, loading }
}
