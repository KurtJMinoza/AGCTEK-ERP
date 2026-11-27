'use client'

import { useCallback, useEffect, useState } from 'react'
import { ficoErrorMessage, ficoJournalService } from '../services/ficoService'
import type { FicoJournalEntry } from '../types'

export function useJournalEntry(id: string, companyId?: string) {
    const [data, setData] = useState<FicoJournalEntry | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!id || !companyId) {
            setLoading(Boolean(id) && !companyId)
            return
        }
        setLoading(true)
        setError(null)
        try {
            setData(await ficoJournalService.get(id, companyId))
        } catch (err) {
            setError(ficoErrorMessage(err, 'Failed to load journal entry'))
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [id, companyId])

    useEffect(() => {
        void reload()
    }, [reload])

    return { data, loading, error, reload }
}
