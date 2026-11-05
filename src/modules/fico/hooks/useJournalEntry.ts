'use client'

import { useCallback, useEffect, useState } from 'react'
import { ficoErrorMessage, ficoJournalService } from '../services/ficoService'
import type { FicoJournalEntry } from '../types'

export function useJournalEntry(id: string) {
    const [data, setData] = useState<FicoJournalEntry | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const reload = useCallback(async () => {
        if (!id) return
        setLoading(true)
        setError(null)
        try {
            setData(await ficoJournalService.get(id))
        } catch (error) {
            setError(ficoErrorMessage(error, 'Failed to load journal entry'))
        } finally {
            setLoading(false)
        }
    }, [id])
    useEffect(() => void reload(), [reload])
    return { data, loading, error, reload }
}
