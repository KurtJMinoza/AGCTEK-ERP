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
        excludeLegacy: true,
        ...initial,
    })
    const [result, setResult] = useState(empty)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!params.companyId) {
            setResult(empty)
            setLoading(false)
            setError(null)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const page = await ficoJournalService.list(params)
            setResult({
                data: Array.isArray(page?.data) ? page.data : [],
                total: page?.total ?? 0,
                page: page?.page ?? params.page ?? 1,
                pageSize: page?.pageSize ?? params.pageSize ?? 20,
            })
        } catch (err) {
            setError(ficoErrorMessage(err, 'Failed to load journal entries'))
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    return { ...result, params, setParams, loading, error, reload }
}

export function useJournalEntryMutations(
    onSuccess?: () => void | Promise<void>,
) {
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
        reverse: (id: string, payload: { companyId: string; reason: string }) =>
            mutate(() => ficoJournalService.reverse(id, payload)),
    }
}
