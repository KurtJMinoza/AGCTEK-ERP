'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    statusTag,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoCalendarService, ficoPeriodService } from '../services/ficoService'
import type { FicoFiscalYearSummary, FicoPeriod } from '../types'

const ROUTE = '/modules/fico/fiscal-periods'

type PeriodAction = 'open' | 'restrict' | 'close' | 'lock' | 'reopen' | 'unlock'

const ACTION_LABELS: Record<PeriodAction, string> = {
    open: 'Open period',
    restrict: 'Restrict period',
    close: 'Close period',
    lock: 'Lock period',
    reopen: 'Reopen period',
    unlock: 'Unlock period',
}

const ACTION_DESCRIPTIONS: Record<PeriodAction, string> = {
    open: 'The period becomes available for manual and automatic postings.',
    restrict: 'Automatic postings remain allowed, but manual postings are blocked.',
    close:
        'Closing checks for incomplete or unbalanced documents. The action is recorded in the period history.',
    lock: 'A locked period cannot be posted to and requires the privileged unlock action.',
    reopen:
        'Reopening a closed period requires a reason and is audited. Use this only for approved corrections.',
    unlock:
        'Unlocking a locked period requires a reason and the separate period-unlock permission. It is audited.',
}

const FiscalPeriodsPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [years, setYears] = useState<FicoFiscalYearSummary[]>([])
    const [periods, setPeriods] = useState<FicoPeriod[]>([])
    const [loading, setLoading] = useState(false)
    const [fiscalYear, setFiscalYear] = useState('')
    const [status, setStatus] = useState('')
    const [actionState, setActionState] = useState<{
        period: FicoPeriod
        action: PeriodAction
    } | null>(null)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)
    const [historyPeriod, setHistoryPeriod] = useState<FicoPeriod | null>(null)
    const [history, setHistory] = useState<
        Array<{
            id: string
            action: string
            fromStatus: string | null
            toStatus: string | null
            reason: string | null
            actorId: string | null
            createdAt: string
        }>
    >([])

    const loadYears = useCallback(() => {
        if (!companyId) return
        ficoCalendarService
            .listFiscalYears(companyId)
            .then((rows) => {
                setYears(rows)
                setFiscalYear((current) => current || String(rows[0]?.fiscalYear ?? ''))
            })
            .catch((error) => notifyError(error, 'Unable to load fiscal years.'))
    }, [companyId])

    const loadPeriods = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoPeriodService
            .list({
                companyId,
                fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
                status: status || undefined,
            })
            .then(setPeriods)
            .catch((error) => notifyError(error, 'Unable to load posting periods.'))
            .finally(() => setLoading(false))
    }, [companyId, fiscalYear, status])

    useEffect(() => {
        loadYears()
    }, [loadYears])

    useEffect(() => {
        loadPeriods()
    }, [loadPeriods])

    const executeAction = async () => {
        if (!actionState || !companyId) return
        if (
            (actionState.action === 'reopen' ||
                actionState.action === 'unlock') &&
            reason.trim().length < 3
        ) {
            notifyError(null, 'A reason of at least 3 characters is required.')
            return
        }
        setSaving(true)
        try {
            await ficoPeriodService.action(
                actionState.period.id,
                actionState.action,
                companyId,
                reason.trim() || undefined,
            )
            notifySuccess(
                `${ACTION_LABELS[actionState.action]} completed for period ${String(
                    actionState.period.periodNumber,
                ).padStart(2, '0')}/${actionState.period.fiscalYear}.`,
            )
            setActionState(null)
            setReason('')
            loadPeriods()
            loadYears()
        } catch (error) {
            notifyError(error, 'Unable to change the period status.')
        } finally {
            setSaving(false)
        }
    }

    const openHistory = async (period: FicoPeriod) => {
        setHistoryPeriod(period)
        try {
            setHistory(await ficoPeriodService.history(period.id))
        } catch (error) {
            notifyError(error, 'Unable to load period history.')
        }
    }

    const actionButtons = (period: FicoPeriod) => {
        const actions: PeriodAction[] = []
        if (period.status === 'FUTURE') actions.push('open')
        if (period.status === 'OPEN') actions.push('restrict', 'close')
        if (period.status === 'RESTRICTED') actions.push('open', 'close')
        if (period.status === 'CLOSED') actions.push('reopen', 'lock')
        if (period.status === 'LOCKED') actions.push('unlock')
        return actions
    }

    const columns = useMemo<ColumnDef<FicoPeriod>[]>(
        () => [
            {
                header: 'Period',
                accessorKey: 'periodNumber',
                cell: ({ row }) =>
                    `${String(row.original.periodNumber).padStart(2, '0')}/${
                        row.original.fiscalYear
                    }`,
            },
            { header: 'Name', accessorKey: 'name' },
            {
                header: 'Type',
                accessorKey: 'periodType',
                cell: ({ row }) => (
                    <span className="text-xs">
                        {row.original.periodType}
                        {row.original.isYearEndAdjustment ? ' · year-end' : ''}
                    </span>
                ),
            },
            {
                header: 'Dates',
                id: 'dates',
                cell: ({ row }) =>
                    `${new Date(row.original.startDate).toLocaleDateString()} → ${new Date(
                        row.original.endDate,
                    ).toLocaleDateString()}`,
            },
            {
                header: 'Journals',
                accessorKey: '_count.journalEntries',
                cell: ({ row }) => row.original._count?.journalEntries ?? 0,
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => statusTag(row.original.status),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex flex-wrap justify-end gap-1">
                        {actionButtons(row.original).map((action) => (
                            <Button
                                key={action}
                                size="sm"
                                onClick={() =>
                                    setActionState({
                                        period: row.original,
                                        action,
                                    })
                                }
                            >
                                {action === 'open'
                                    ? 'Open'
                                    : action === 'restrict'
                                      ? 'Restrict'
                                      : action === 'close'
                                        ? 'Close'
                                        : action === 'lock'
                                          ? 'Lock'
                                          : action === 'reopen'
                                            ? 'Reopen'
                                            : 'Unlock'}
                            </Button>
                        ))}
                        <Button size="sm" onClick={() => openHistory(row.original)}>
                            History
                        </Button>
                    </div>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Posting Periods"
                description="Open, restrict, close, lock, reopen and unlock fiscal periods with audited reasons."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={companyLoading}
                    />
                }
            />
            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <Input
                        type="number"
                        placeholder="Fiscal year"
                        value={fiscalYear}
                        onChange={(event) => setFiscalYear(event.target.value)}
                        list="fico-fiscal-year-options"
                    />
                    <datalist id="fico-fiscal-year-options">
                        {years.map((year) => (
                            <option key={year.fiscalYear} value={year.fiscalYear} />
                        ))}
                    </datalist>
                    <Input
                        placeholder="Status (OPEN, CLOSED...)"
                        value={status}
                        onChange={(event) => setStatus(event.target.value.toUpperCase())}
                    />
                    <Button onClick={loadPeriods} loading={loading}>
                        Refresh
                    </Button>
                    <p className="self-center text-xs text-gray-500">
                        Closing never uses GR/IR balances alone. Incomplete documents and
                        unbalanced journals block closing.
                    </p>
                </div>
                <DataTable
                    columns={columns}
                    data={periods}
                    loading={loading}
                    noData={!periods.length}
                    getRowId={(row) => row.id}
                    rowClassName={(row) =>
                        row.status === 'LOCKED'
                            ? 'bg-red-50/40'
                            : row.status === 'CLOSED'
                              ? 'bg-gray-50/60'
                              : undefined
                    }
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={Boolean(actionState)}
                onClose={() => {
                    setActionState(null)
                    setReason('')
                }}
                title={
                    actionState
                        ? `${ACTION_LABELS[actionState.action]} — ${String(
                              actionState.period.periodNumber,
                          ).padStart(2, '0')}/${actionState.period.fiscalYear}`
                        : ''
                }
                description={
                    actionState ? ACTION_DESCRIPTIONS[actionState.action] : undefined
                }
                onSubmit={executeAction}
                confirmText={actionState ? ACTION_LABELS[actionState.action] : 'Confirm'}
                confirmLoading={saving}
            >
                <FormItem
                    label={
                        actionState?.action === 'reopen' ||
                        actionState?.action === 'unlock'
                            ? 'Reason (required)'
                            : 'Reason (optional)'
                    }
                >
                    <Input
                        textArea
                        rows={3}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Explain the business reason for this change."
                    />
                </FormItem>
            </FormDialog>

            <FormDialog
                isOpen={Boolean(historyPeriod)}
                onClose={() => {
                    setHistoryPeriod(null)
                    setHistory([])
                }}
                title={
                    historyPeriod
                        ? `Period history — ${String(historyPeriod.periodNumber).padStart(
                              2,
                              '0',
                          )}/${historyPeriod.fiscalYear}`
                        : 'Period history'
                }
                size="lg"
                footer={<Button onClick={() => setHistoryPeriod(null)}>Close</Button>}
            >
                {history.length ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {history.map((entry) => (
                            <li key={entry.id} className="py-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium">{entry.action}</span>
                                    <span className="text-xs text-gray-500">
                                        {new Date(entry.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    {entry.fromStatus ?? '—'} → {entry.toStatus ?? '—'}
                                    {entry.actorId ? ` · ${entry.actorId}` : ''}
                                </p>
                                {entry.reason ? (
                                    <p className="mt-1 text-sm">{entry.reason}</p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500">
                        No status history has been recorded for this period.
                    </p>
                )}
            </FormDialog>
        </PageContainer>
    )
}

export default FiscalPeriodsPage
