'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
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
import { useDocumentTypes } from '../hooks/useDocumentTypes'
import { useJournalEntries } from '../hooks/useJournalEntries'
import type { FicoJournalEntry, FicoJournalEntryStatus } from '../types'

const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'POSTED', label: 'Posted' },
    { value: 'REVERSED', label: 'Reversed' },
]

const tone = (status: FicoJournalEntryStatus) =>
    status === 'POSTED' ? 'success' : status === 'REVERSED' ? 'warning' : 'info'

export default function JournalEntriesPage() {
    const state = useJournalEntries()
    const { setParams } = state
    const types = useDocumentTypes()
    const access = useResourceAccess('fico.journal-entries')
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const breadcrumbs = buildErpBreadcrumbs('/modules/fico/journal-entries')

    useEffect(() => {
        setParams((current) => {
            const nextCompanyId = companyId || undefined
            if (current.companyId === nextCompanyId) return current
            return { ...current, page: 1, companyId: nextCompanyId }
        })
    }, [companyId, setParams])

    const columns = useMemo<ColumnDef<FicoJournalEntry>[]>(
        () => [
            {
                header: 'Document',
                cell: ({ row }) => (
                    <Link
                        className="font-semibold text-primary"
                        href={`/modules/fico/journal-entries/${row.original.id}`}
                    >
                        {row.original.documentNumber || 'Draft'}
                    </Link>
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => row.original.documentTypeRef?.code || '—',
            },
            {
                header: 'Posting Date',
                cell: ({ row }) =>
                    new Date(row.original.postingDate).toLocaleDateString(),
            },
            {
                header: 'Reference',
                cell: ({ row }) => row.original.reference || '—',
            },
            { header: 'Currency', accessorKey: 'currencyCode' },
            {
                header: 'Amount',
                cell: ({ row }) =>
                    row.original.lines
                        .reduce((sum, line) => sum + Number(line.debitAmount), 0)
                        .toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        }),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={tone(row.original.status)}>
                        {row.original.status}
                    </StatusBadge>
                ),
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
                description="Create, post, review, and reverse balanced G/L documents."
                actions={
                    access.canCreate ? (
                        <Link href="/modules/fico/journal-entries/new">
                            <Button variant="solid">New journal entry</Button>
                        </Link>
                    ) : undefined
                }
            />
            {state.error && (
                <Alert showIcon type="danger" className="mb-4">
                    {state.error}
                </Alert>
            )}
            <AdaptiveCard className="mb-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={companyLoading}
                    />
                    <Input
                        placeholder="Search document, reference, or text"
                        value={state.params.search ?? ''}
                        onChange={(event) =>
                            state.setParams((current) => ({
                                ...current,
                                page: 1,
                                search: event.target.value,
                            }))
                        }
                    />
                    <Select
                        instanceId="journal-entry-type-filter"
                        isClearable={false}
                        options={[
                            { value: '', label: 'All document types' },
                            ...types.data.map((type) => ({
                                value: type.id,
                                label: `${type.code} — ${type.name}`,
                            })),
                        ]}
                        value={
                            [
                                { value: '', label: 'All document types' },
                                ...types.data.map((type) => ({
                                    value: type.id,
                                    label: `${type.code} — ${type.name}`,
                                })),
                            ].find(
                                (option) =>
                                    option.value ===
                                    (state.params.documentTypeId ?? ''),
                            ) ?? null
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
                    <Select
                        instanceId="journal-entry-status-filter"
                        isClearable={false}
                        options={STATUS_OPTIONS}
                        value={
                            STATUS_OPTIONS.find(
                                (option) =>
                                    option.value === (state.params.status ?? ''),
                            ) ?? STATUS_OPTIONS[0]
                        }
                        onChange={(option) =>
                            state.setParams((current) => ({
                                ...current,
                                page: 1,
                                status:
                                    ((option as { value: string } | null)
                                        ?.value as
                                        | FicoJournalEntryStatus
                                        | '') || undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={state.data}
                    loading={state.loading}
                    noData={!state.loading && !state.data.length}
                    pagingData={{
                        total: state.total,
                        pageIndex: state.page,
                        pageSize: state.pageSize,
                    }}
                    onPaginationChange={(page) =>
                        state.setParams((current) => ({ ...current, page }))
                    }
                    onSelectChange={(pageSize) =>
                        state.setParams((current) => ({
                            ...current,
                            page: 1,
                            pageSize,
                        }))
                    }
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
