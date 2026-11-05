'use client'

import { useCallback, useEffect, useState } from 'react'
import { ficoErrorMessage, ficoJournalService } from '../services/ficoService'
import type {
    FicoJournalEntry,
    FicoJournalEntryInput,
    FicoJournalEntryParams,
    FicoPaginated,
} from '../types'

const empty: FicoPaginated<FicoJournalEntry> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useJournalEntries(initial?: FicoJournalEntryParams) {
    const [params, setParams] = useState<FicoJournalEntryParams>({
        page: 1,
        pageSize: 20,
        ...initial,
    })
    const [result, setResult] = useState(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setResult(await ficoJournalService.list(params))
        } catch (error) {
            setError(ficoErrorMessage(error, 'Failed to load journal entries'))
        } finally {
            setLoading(false)
        }
    }, [params])
    useEffect(() => void reload(), [reload])
    return { ...result, params, setParams, loading, error, reload }
}

export function useJournalEntryMutations(onSuccess?: () => void | Promise<void>) {
    const [saving, setSaving] = useState(false)
    const mutate = async <T,>(work: () => Promise<T>) => {
        setSaving(true)
        try {
            const result = await work()
            await onSuccess?.()
            return result
        } finally {
            setSaving(false)
        }
    }
    return {
        saving,
        create: (body: FicoJournalEntryInput) =>
            mutate(() => ficoJournalService.create(body)),
        post: (id: string) => mutate(() => ficoJournalService.post(id)),
        reverse: (id: string, postingDate?: string) =>
            mutate(() => ficoJournalService.reverse(id, postingDate)),
    }
}
