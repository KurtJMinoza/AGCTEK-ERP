'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import JournalEntryPreviewPanel from '../components/JournalEntryPreviewPanel'
import { useDocumentTypes } from '../hooks/useDocumentTypes'
import { useJournalEntries } from '../hooks/useJournalEntries'
import type { FicoJournalEntry, FicoJournalEntryStatus } from '../types'
import {
    isAutomatedJournal,
    journalSourceDocumentHref,
    journalSourceModuleLabel,
} from '../utils/journalSourceLinks'

/** Sentinel: default list mode hides LEGACY stubs. */
const STATUS_ACTIVE = '__ACTIVE__'
const STATUS_ALL = '__ALL__'

const STATUS_OPTIONS = [
    { value: STATUS_ACTIVE, label: 'Active (excl. Legacy)' },
    { value: STATUS_ALL, label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'REVERSED', label: 'Reversed' },
    { value: 'LEGACY', label: 'Legacy' },
]

function statusFilterValue(params: {
    status?: FicoJournalEntryStatus
    excludeLegacy?: boolean
}) {
    if (params.status) return params.status
    if (params.excludeLegacy === false) return STATUS_ALL
    return STATUS_ACTIVE
}

const SOURCE_OPTIONS = [
    { value: '', label: 'All sources' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'MM', label: 'MM' },
]

function asMoney(value: unknown) {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

const money = (value: number) =>
    asMoney(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const tone = (status: FicoJournalEntryStatus) =>
    status === 'POSTED'
        ? 'success'
        : status === 'REVERSED'
          ? 'warning'
          : status === 'LEGACY'
            ? 'default'
            : 'info'

function debitTotal(entry: FicoJournalEntry) {
    if (entry.lines?.length) {
        return entry.lines.reduce(
            (sum, line) => sum + asMoney(line.debitAmount),
            0,
        )
    }
    return asMoney(entry.totalAmount)
}

/** POSTED/REVERSED/LEGACY always prefer the real document number; "Draft" is DRAFT-only. */
function journalListTitle(entry: FicoJournalEntry) {
    const number = entry.documentNumber?.trim()
    if (number) return number
    if (entry.status === 'DRAFT') return 'Draft'
    return '—'
}

function journalTypeLabel(entry: FicoJournalEntry) {
    return (
        entry.documentTypeRef?.code ||
        entry.documentType ||
        '—'
    )
}

export default function JournalEntriesPage() {
    const state = useJournalEntries()
    const { setParams, reload } = state
    const types = useDocumentTypes()
    const access = useResourceAccess('fico.journal-entries')
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const breadcrumbs = buildErpBreadcrumbs('/modules/fico/journal-entries')
    const [searchInput, setSearchInput] = useState(state.params.search ?? '')
    const [selectedId, setSelectedId] = useState<string | null>(null)

    useEffect(() => {
        setParams((current) => {
            const nextCompanyId = companyId || undefined
            if (current.companyId === nextCompanyId) return current
            return { ...current, page: 1, companyId: nextCompanyId }
        })
        setSelectedId(null)
    }, [companyId, setParams])

    useEffect(() => {
        const handle = window.setTimeout(() => {
            setParams((current) => {
                const next = searchInput.trim() || undefined
                if ((current.search ?? undefined) === next) return current
                return { ...current, page: 1, search: next }
            })
        }, 300)
        return () => window.clearTimeout(handle)
    }, [searchInput, setParams])

    const rows = state.data ?? []

    useEffect(() => {
        if (!selectedId) return
        if (!rows.some((row) => row.id === selectedId)) {
            setSelectedId(null)
        }
    }, [rows, selectedId])

    const typeOptions = useMemo(
        () => [
            { value: '', label: 'All document types' },
            ...(types.data ?? [])
                .filter((type) => type.isActive !== false)
                .map((type) => ({
                    value: type.id,
                    label: `${type.code} — ${type.name}`,
                })),
        ],
        [types.data],
    )

    const companyLabel =
        companies.find((company) => company.id === companyId)?.name ??
        companyId ??
        '—'

    const columns = useMemo<ColumnDef<FicoJournalEntry>[]>(
        () => [
            {
                id: 'entry',
                header: 'Entry',
                cell: ({ row }) => {
                    const entry = row.original
                    const typeLabel = journalTypeLabel(entry)
                    const dateLabel = new Date(
                        entry.postingDate,
                    ).toLocaleDateString()
                    const automated = isAutomatedJournal(entry)
                    const sourceLabel = automated
                        ? journalSourceModuleLabel(entry)
                        : 'Manual'
                    const sourceHref = automated
                        ? journalSourceDocumentHref(
                              entry.sourceModule,
                              entry.sourceDocumentType,
                              entry.sourceDocumentId,
                          )
                        : null

                    return (
                        <div className="min-w-0 py-0.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 truncate font-semibold text-primary">
                                    {journalListTitle(entry)}
                                </div>
                                <span className="shrink-0 tabular-nums text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {money(debitTotal(entry))}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                                <div className="min-w-0 truncate text-xs text-gray-500">
                                    {typeLabel} · {dateLabel}
                                </div>
                                <StatusBadge
                                    tone={tone(entry.status)}
                                    className="shrink-0"
                                >
                                    {entry.status}
                                </StatusBadge>
                            </div>
                            <div className="mt-0.5 truncate text-xs">
                                {sourceHref ? (
                                    <Link
                                        href={sourceHref}
                                        className="font-medium text-primary hover:underline"
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                    >
                                        {sourceLabel}
                                    </Link>
                                ) : (
                                    <span className="text-gray-500">
                                        {sourceLabel}
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                },
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbs} />
            <Breadcrumb items={breadcrumbs} className="mb-4" />
            <PageHeader
                title="Journal Entries"
                description="Post and review financial accounting documents"
                actions={
                    access.canCreate ? (
                        <Link href="/modules/fico/journal-entries/new">
                            <Button variant="solid">New journal entry</Button>
                        </Link>
                    ) : undefined
                }
            />
            {(state.error || types.error) && (
                <Alert showIcon type="danger" className="mb-4">
                    {state.error || types.error}
                </Alert>
            )}

            <AdaptiveCard className="mb-4">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <FormItem label="Company" className="mb-0">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                    </FormItem>
                    <FormItem label="Posting date from" className="mb-0">
                        <Input
                            type="date"
                            value={state.params.dateFrom ?? ''}
                            onChange={(event) =>
                                state.setParams((current) => ({
                                    ...current,
                                    page: 1,
                                    dateFrom: event.target.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting date to" className="mb-0">
                        <Input
                            type="date"
                            value={state.params.dateTo ?? ''}
                            onChange={(event) =>
                                state.setParams((current) => ({
                                    ...current,
                                    page: 1,
                                    dateTo: event.target.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Status" className="mb-0">
                        <Select
                            instanceId="journal-entry-status-filter"
                            isClearable={false}
                            options={STATUS_OPTIONS}
                            value={
                                STATUS_OPTIONS.find(
                                    (option) =>
                                        option.value ===
                                        statusFilterValue(state.params),
                                ) ?? STATUS_OPTIONS[0]
                            }
                            onChange={(option) => {
                                const value =
                                    (option as { value: string } | null)
                                        ?.value ?? STATUS_ACTIVE
                                state.setParams((current) => {
                                    if (value === STATUS_ACTIVE) {
                                        return {
                                            ...current,
                                            page: 1,
                                            status: undefined,
                                            excludeLegacy: true,
                                        }
                                    }
                                    if (value === STATUS_ALL) {
                                        return {
                                            ...current,
                                            page: 1,
                                            status: undefined,
                                            excludeLegacy: false,
                                        }
                                    }
                                    return {
                                        ...current,
                                        page: 1,
                                        status: value as FicoJournalEntryStatus,
                                        excludeLegacy: false,
                                    }
                                })
                            }}
                        />
                    </FormItem>
                    <FormItem label="Document type" className="mb-0">
                        <Select
                            instanceId="journal-entry-type-filter"
                            isClearable={false}
                            options={typeOptions}
                            value={
                                typeOptions.find(
                                    (option) =>
                                        option.value ===
                                        (state.params.documentTypeId ?? ''),
                                ) ?? typeOptions[0]
                            }
                            onChange={(option) =>
                                state.setParams((current) => ({
                                    ...current,
                                    page: 1,
                                    documentTypeId:
                                        (option as { value: string } | null)
                                            ?.value || undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source" className="mb-0">
                        <Select
                            instanceId="journal-entry-source-filter"
                            isClearable={false}
                            options={SOURCE_OPTIONS}
                            value={
                                SOURCE_OPTIONS.find(
                                    (option) =>
                                        option.value ===
                                        (state.params.source ?? ''),
                                ) ?? SOURCE_OPTIONS[0]
                            }
                            onChange={(option) =>
                                state.setParams((current) => ({
                                    ...current,
                                    page: 1,
                                    source:
                                        ((option as { value: string } | null)
                                            ?.value as 'MANUAL' | 'MM' | '') ||
                                        undefined,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Search"
                        className="mb-0 md:col-span-3 xl:col-span-6"
                    >
                        <Input
                            placeholder="Document number, reference, or header text"
                            value={searchInput}
                            onChange={(event) =>
                                setSearchInput(event.target.value)
                            }
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            <div className="grid gap-4 xl:grid-cols-5 xl:items-start">
                <div className="min-w-0 xl:col-span-2">
                    <AdaptiveCard className="min-w-0 overflow-hidden p-0">
                        {!companyId && !companyLoading ? (
                            <p className="p-4 text-sm text-gray-500">
                                Select a company to load journal entries.
                            </p>
                        ) : (
                            <div className="max-h-[min(70vh,42rem)] overflow-auto">
                                <div className="p-3">
                                    <DataTable
                                        columns={columns}
                                        data={rows}
                                        loading={
                                            state.loading || companyLoading
                                        }
                                        noData={
                                            !state.loading &&
                                            !companyLoading &&
                                            rows.length === 0
                                        }
                                        stickyPageSize
                                        pagingData={{
                                            total: state.total,
                                            pageIndex: state.page,
                                            pageSize: state.pageSize,
                                        }}
                                        onPaginationChange={(page) =>
                                            state.setParams((current) => ({
                                                ...current,
                                                page,
                                            }))
                                        }
                                        onSelectChange={(pageSize) =>
                                            state.setParams((current) => ({
                                                ...current,
                                                page: 1,
                                                pageSize,
                                            }))
                                        }
                                        getRowId={(row) => row.id}
                                        onRowClick={(row) =>
                                            setSelectedId(row.id)
                                        }
                                        rowClassName={(row) =>
                                            row.id === selectedId
                                                ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </AdaptiveCard>
                </div>

                <div className="min-w-0 xl:col-span-3 xl:max-h-[min(70vh,42rem)] xl:overflow-y-auto">
                    <JournalEntryPreviewPanel
                        entryId={selectedId}
                        companyId={companyId || undefined}
                        companyLabel={companyLabel}
                        onMutated={() => void reload()}
                    />
                </div>
            </div>
        </PageContainer>
    )
}
