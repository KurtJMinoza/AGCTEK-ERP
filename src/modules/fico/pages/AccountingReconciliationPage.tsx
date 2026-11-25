'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { HiOutlineExclamation, HiOutlineRefresh } from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoStatusCell,
    FicoTwoLineCell,
} from '../components/ficoTableUi'
import {
    ficoAccountingEventService,
    ficoReconciliationService,
} from '../services/ficoService'
import type { FicoReconciliationCase, FicoReconciliationScan } from '../types'

const ROUTE = '/modules/fico/accounting-reconciliation'

const AccountingReconciliationPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [severity, setSeverity] = useState('')
    const [category, setCategory] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<FicoReconciliationScan | null>(null)
    const [selected, setSelected] = useState<FicoReconciliationCase | null>(null)
    const [notes, setNotes] = useState('')
    const [resolutionCode, setResolutionCode] = useState('')
    const [resolutionNotes, setResolutionNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoReconciliationService
            .scan({
                companyId,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                syncCases: true,
            })
            .then(setData)
            .catch((error) =>
                notifyError(error, 'Unable to run reconciliation scan.'),
            )
            .finally(() => setLoading(false))
    }, [companyId, dateFrom, dateTo])

    useEffect(() => {
        load()
    }, [load])

    const cases = useMemo(() => {
        const rows = data?.cases ?? []
        return rows.filter((row) => {
            if (severity && row.severity !== severity) return false
            if (category && row.category !== category) return false
            if (status && row.status !== status) return false
            return true
        })
    }, [data?.cases, severity, category, status])

    const categories = useMemo(() => {
        const set = new Set((data?.cases ?? []).map((c) => c.category))
        return [...set].sort()
    }, [data?.cases])

    const openCase = (row: FicoReconciliationCase) => {
        setSelected(row)
        setNotes(row.investigationNotes ?? '')
        setResolutionCode(row.resolutionCode ?? '')
        setResolutionNotes(row.resolutionNotes ?? '')
    }

    const saveCase = async () => {
        if (!selected) return
        setSaving(true)
        try {
            await ficoReconciliationService.updateCase(selected.id, {
                status: selected.status === 'OPEN' ? 'INVESTIGATING' : selected.status,
                investigationNotes: notes,
                resolutionCode: resolutionCode || undefined,
                resolutionNotes: resolutionNotes || undefined,
            })
            notifySuccess('Case notes saved.')
            setSelected(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to update case.')
        } finally {
            setSaving(false)
        }
    }

    const resolveCase = async (nextStatus: 'RESOLVED' | 'DISMISSED') => {
        if (!selected) return
        setSaving(true)
        try {
            await ficoReconciliationService.updateCase(selected.id, {
                status: nextStatus,
                investigationNotes: notes,
                resolutionCode: resolutionCode || undefined,
                resolutionNotes: resolutionNotes || undefined,
            })
            notifySuccess('Case resolved — no ledger amounts were changed.')
            setSelected(null)
            load()
        } catch (error) {
            notifyError(error, 'Unable to resolve case.')
        } finally {
            setSaving(false)
        }
    }

    const retryEvent = async () => {
        if (!selected?.mmAccountingEventId) return
        setSaving(true)
        try {
            await ficoAccountingEventService.retry(selected.mmAccountingEventId)
            notifySuccess('Accounting event retry queued.')
            load()
        } catch (error) {
            notifyError(error, 'Retry failed.')
        } finally {
            setSaving(false)
        }
    }

    const columns: ColumnDef<FicoReconciliationCase>[] = [
        {
            header: 'Severity',
            accessorKey: 'severity',
            cell: ({ row }) => (
                <FicoStatusCell status={row.original.severity} />
            ),
        },
        {
            header: 'Category',
            accessorKey: 'category',
            cell: ({ row }) => (
                <FicoTwoLineCell
                    primary={row.original.category.replaceAll('_', ' ')}
                    secondary={row.original.status}
                />
            ),
        },
        {
            header: 'Exception',
            accessorKey: 'message',
            cell: ({ row }) => (
                <span className="line-clamp-2 text-sm">{row.original.message}</span>
            ),
        },
        {
            header: 'References',
            id: 'refs',
            cell: ({ row }) => (
                <div className="flex flex-col gap-1 text-xs">
                    {row.original.journalEntryId ? (
                        <Link
                            className="text-primary hover:underline"
                            href={`/modules/fico/journal-entries/${row.original.journalEntryId}`}
                        >
                            Journal
                        </Link>
                    ) : null}
                    {row.original.mmAccountingEventId ? (
                        <span>
                            Event {row.original.mmAccountingEventId.slice(0, 8)}…
                        </span>
                    ) : null}
                    {row.original.sourceDocumentId ? (
                        <span>
                            {row.original.sourceModule ?? 'SRC'} ·{' '}
                            {row.original.sourceDocumentId.slice(0, 10)}…
                        </span>
                    ) : null}
                </div>
            ),
        },
        {
            header: '',
            id: 'action',
            cell: ({ row }) => (
                <Button
                    size="sm"
                    variant="plain"
                    onClick={() => openCase(row.original)}
                >
                    Investigate
                </Button>
            ),
        },
    ]

    return (
        <PageContainer>
            <PageHeader
                title="Accounting Reconciliation"
                description="Detect integrity exceptions across journals, MM/POS integration, and trial balance — resolve via authorized journals, reversals, or controlled repairs (never silent G/L edits)."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <Button
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Scan
                        </Button>
                    </div>
                }
            />

            {data?.hasCriticalIntegrityExceptions ? (
                <AdaptiveCard className="mb-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
                    <div className="flex items-start gap-3 p-4 text-red-800 dark:text-red-200">
                        <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-semibold">Critical integrity exceptions</p>
                            <p className="text-sm">
                                This company ledger has unresolved ERROR-level reconciliation
                                exceptions. Clear blocking items before period close.
                            </p>
                        </div>
                    </div>
                </AdaptiveCard>
            ) : null}

            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Errors"
                    value={String(data?.summary.errorCount ?? 0)}
                    tone={
                        (data?.summary.errorCount ?? 0) > 0 ? 'danger' : 'success'
                    }
                />
                <StatCard
                    label="Warnings"
                    value={String(data?.summary.warningCount ?? 0)}
                />
                <StatCard
                    label="Open cases"
                    value={String(
                        (data?.cases ?? []).filter((c) =>
                            ['OPEN', 'INVESTIGATING'].includes(c.status),
                        ).length,
                    )}
                />
                <StatCard
                    label="Detected (scan)"
                    value={String(data?.summary.total ?? 0)}
                />
            </div>

            <FilterBar className="mb-4">
                <FormItem label="From">
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </FormItem>
                <FormItem label="To">
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </FormItem>
                <FormItem label="Severity">
                    <Select
                        value={severity}
                        onChange={(v) => setSeverity(v ?? '')}
                        options={[
                            { label: 'All', value: '' },
                            { label: 'Error', value: 'ERROR' },
                            { label: 'Warning', value: 'WARNING' },
                            { label: 'Info', value: 'INFO' },
                        ]}
                    />
                </FormItem>
                <FormItem label="Category">
                    <Select
                        value={category}
                        onChange={(v) => setCategory(v ?? '')}
                        options={[
                            { label: 'All', value: '' },
                            ...categories.map((c) => ({
                                label: c.replaceAll('_', ' '),
                                value: c,
                            })),
                        ]}
                    />
                </FormItem>
                <FormItem label="Status">
                    <Select
                        value={status}
                        onChange={(v) => setStatus(v ?? '')}
                        options={[
                            { label: 'All', value: '' },
                            { label: 'Open', value: 'OPEN' },
                            { label: 'Investigating', value: 'INVESTIGATING' },
                            { label: 'Resolved', value: 'RESOLVED' },
                        ]}
                    />
                </FormItem>
            </FilterBar>

            <FicoResponsiveTable
                columns={columns}
                data={cases}
                loading={loading}
                noData={!loading && cases.length === 0}
            />

            <Dialog
                isOpen={Boolean(selected)}
                onClose={() => setSelected(null)}
                width={640}
            >
                <h4 className="mb-2 text-lg font-semibold">Exception detail</h4>
                {selected ? (
                    <div className="space-y-3 text-sm">
                        <p>{selected.message}</p>
                        <p className="text-gray-500">
                            Recommended: {selected.recommendedAction ?? '—'}
                        </p>
                        <FormItem label="Investigation notes">
                            <Input
                                textArea
                                rows={4}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Resolution code">
                            <Input
                                value={resolutionCode}
                                onChange={(e) => setResolutionCode(e.target.value)}
                                placeholder="e.g. JOURNAL_CORRECTION, REVERSAL_POSTED"
                            />
                        </FormItem>
                        <FormItem label="Resolution evidence / notes">
                            <Input
                                textArea
                                rows={3}
                                value={resolutionNotes}
                                onChange={(e) => setResolutionNotes(e.target.value)}
                            />
                        </FormItem>
                        <div className="flex flex-wrap gap-2 pt-2">
                            {selected.mmAccountingEventId ? (
                                <Button loading={saving} onClick={retryEvent}>
                                    Authorized retry (event)
                                </Button>
                            ) : null}
                            {selected.journalEntryId ? (
                                <Link
                                    href={`/modules/fico/journal-entries/${selected.journalEntryId}`}
                                >
                                    <Button variant="twoTone">Open journal</Button>
                                </Link>
                            ) : null}
                            <Button loading={saving} onClick={saveCase}>
                                Save notes
                            </Button>
                            <Button
                                variant="solid"
                                loading={saving}
                                onClick={() => resolveCase('RESOLVED')}
                            >
                                Mark resolved
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Dialog>
        </PageContainer>
    )
}

export default AccountingReconciliationPage