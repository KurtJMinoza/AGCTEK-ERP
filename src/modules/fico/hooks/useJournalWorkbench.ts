'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ficoJournalService } from '../services/ficoService'
import type {
    FicoJournalEntryListItem,
    FicoJournalListQuery,
    FicoJournalWorkbenchSummary,
} from '../types'
import { notifyError } from '../components/FicoCompanySelect'

const STORAGE_KEY = 'fico.journal.filters'

export type JournalWorkbenchTab =
    | 'all'
    | 'manual'
    | 'automatic'
    | 'my-drafts'
    | 'pending-approval'
    | 'ready-to-post'
    | 'posted'
    | 'reversed'

const defaultFilters = (): FicoJournalListQuery => ({
    page: 1,
    pageSize: 25,
    sortBy: 'postingDate',
    sortDir: 'desc',
})

function sanitizeStoredFilters(
    parsed: Partial<FicoJournalListQuery>,
): FicoJournalListQuery {
    const base = defaultFilters()
    return {
        ...base,
        search: parsed.search,
        status: parsed.status,
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        sourceModule: parsed.sourceModule,
        sortBy: parsed.sortBy ?? base.sortBy,
        sortDir: parsed.sortDir ?? base.sortDir,
    }
}

export function useJournalWorkbench(companyId: string) {
    const [tab, setTab] = useState<JournalWorkbenchTab>('all')
    const [filters, setFilters] = useState<FicoJournalListQuery>(() => {
        if (typeof window === 'undefined') return defaultFilters()
        try {
            const raw = window.sessionStorage.getItem(STORAGE_KEY)
            return raw
                ? sanitizeStoredFilters(JSON.parse(raw) as Partial<FicoJournalListQuery>)
                : defaultFilters()
        } catch {
            return defaultFilters()
        }
    })
    const [searchInput, setSearchInput] = useState(filters.search ?? '')
    const [items, setItems] = useState<FicoJournalEntryListItem[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] =
        useState<FicoJournalWorkbenchSummary | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }))
        }, 350)
        return () => window.clearTimeout(timer)
    }, [searchInput])

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const { page, pageSize, ...persist } = filters
            void page
            void pageSize
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persist))
        }
    }, [filters])

    const listQuery = useMemo((): FicoJournalListQuery & { companyId: string } => {
        if (!companyId) return { companyId: '', ...filters }
        return {
            companyId,
            tab: tab === 'all' ? undefined : tab,
            ...filters,
        }
    }, [companyId, tab, filters])

    const reload = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        Promise.all([
            ficoJournalService.list(listQuery),
            ficoJournalService.summary(companyId, {
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
            }),
        ])
            .then(([list, sum]) => {
                setItems(list.items)
                setTotal(list.total)
                setSummary(sum)
            })
            .catch((error) =>
                notifyError(error, 'Unable to load journal entries.'),
            )
            .finally(() => setLoading(false))
    }, [companyId, listQuery, filters.dateFrom, filters.dateTo])

    useEffect(() => {
        reload()
    }, [reload])

    return {
        tab,
        setTab,
        filters,
        setFilters,
        searchInput,
        setSearchInput,
        items,
        total,
        summary,
        loading,
        reload,
        page: filters.page ?? 1,
        setPage: (page: number) =>
            setFilters((prev) => ({ ...prev, page })),
    }
}