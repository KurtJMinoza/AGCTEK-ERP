'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatCard from '@/components/shared/StatCard'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineClipboardList,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoCountCell,
    FicoStatusCell,
    FicoTwoLineCell,
    ficoStatusTone,
    FICO_PERIOD_STATUS,
    formatFicoDate,
} from '../components/ficoTableUi'
import { ficoCalendarService, ficoPeriodService } from '../services/ficoService'
import type {
    FicoFiscalVariant,
    FicoFiscalYearSummary,
    FicoPeriod,
    FicoPeriodSummary,
    FicoPostingVariant,
} from '../types'

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
        'Closing checks for incomplete or unbalanced documents. The action is recorded in the audit trail.',
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
    const [summary, setSummary] = useState<FicoPeriodSummary | null>(null)
    const [fiscalVariants, setFiscalVariants] = useState<FicoFiscalVariant[]>([])
    const [postingVariants, setPostingVariants] = useState<FicoPostingVariant[]>(
        [],
    )
    const [generateOpen, setGenerateOpen] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [generateForm, setGenerateForm] = useState({
        fiscalYear: String(new Date().getFullYear()),
        fiscalYearVariantId: '',
        postingPeriodVariantId: '',
        specialPeriodCount: '0',
    })

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

    const loadSummary = useCallback(() => {
        if (!companyId) return
        ficoPeriodService
            .summary({
                companyId,
                fiscalYear: fiscalYear ? Number(fiscalYear) : undefined,
            })
            .then(setSummary)
            .catch((error) =>
                notifyError(error, 'Unable to load the period dashboard.'),
            )
    }, [companyId, fiscalYear])

    useEffect(() => {
        loadYears()
    }, [loadYears])

    useEffect(() => {
        loadPeriods()
        loadSummary()
    }, [loadPeriods, loadSummary])

    useEffect(() => {
        Promise.all([
            ficoCalendarService.listFiscalVariants(),
            ficoCalendarService.listPostingVariants(),
        ])
            .then(([fiscalRows, postingRows]) => {
                setFiscalVariants(fiscalRows)
                setPostingVariants(postingRows)
                setGenerateForm((current) => ({
                    ...current,
                    fiscalYearVariantId:
                        current.fiscalYearVariantId ||
                        fiscalRows[0]?.id ||
                        '',
                    postingPeriodVariantId:
                        current.postingPeriodVariantId ||
                        postingRows[0]?.id ||
                        '',
                }))
            })
            .catch((error) =>
                notifyError(error, 'Unable to load fiscal calendar references.'),
            )
    }, [])

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
            loadSummary()
        } catch (error) {
            notifyError(error, 'Unable to change the period status.')
        } finally {
            setSaving(false)
        }
    }

    const openGenerate = () => {
        setGenerateForm((current) => ({
            ...current,
            fiscalYear: fiscalYear || current.fiscalYear,
        }))
        setGenerateOpen(true)
    }

    const submitGenerate = async () => {
        if (!companyId) return
        if (
            !generateForm.fiscalYearVariantId ||
            !generateForm.postingPeriodVariantId ||
            !generateForm.fiscalYear
        ) {
            notifyError(
                null,
                'Fiscal year, fiscal year variant and posting period variant are required.',
            )
            return
        }
        setGenerating(true)
        try {
            const result = await ficoCalendarService.generate({
                companyId,
                fiscalYear: Number(generateForm.fiscalYear),
                fiscalYearVariantId: generateForm.fiscalYearVariantId,
                postingPeriodVariantId: generateForm.postingPeriodVariantId,
                specialPeriodCount: Number(generateForm.specialPeriodCount || 0),
            })
            notifySuccess(
                result.existing
                    ? 'Accounting periods already exist for this fiscal year.'
                    : `${result.periods.length} accounting periods generated.`,
            )
            setGenerateOpen(false)
            setFiscalYear(generateForm.fiscalYear)
            loadYears()
            loadPeriods()
            loadSummary()
        } catch (error) {
            notifyError(error, 'Unable to generate accounting periods.')
        } finally {
            setGenerating(false)
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
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="calendar"
                        code={`${String(row.original.periodNumber).padStart(2, '0')}/${row.original.fiscalYear}`}
                        name={row.original.name ?? null}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'periodType',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.periodType}
                        secondary={row.original.isYearEndAdjustment ? 'Year-end adjustment' : undefined}
                    />
                ),
            },
            {
                header: 'Dates',
                id: 'dates',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={`${new Date(row.original.startDate).toLocaleDateString()} → ${new Date(row.original.endDate).toLocaleDateString()}`}
                        secondary={row.original.periodType === 'SPECIAL' ? 'Special period' : undefined}
                    />
                ),
            },
            {
                header: 'Journals',
                accessorKey: '_count.journalEntries',
                cell: ({ row }) => (
                    <FicoCountCell value={row.original._count?.journalEntries ?? 0} label="entries" />
                ),
            },
            {
                header: 'Control dates',
                id: 'controlDates',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.closingDate ? new Date(row.original.closingDate).toLocaleDateString() : '—'}
                        secondary={row.original.lockDate ? `Locked ${new Date(row.original.lockDate).toLocaleDateString()}` : row.original.closingDate ? 'Not locked' : '—'}
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <FicoStatusCell status={row.original.status} map={FICO_PERIOD_STATUS} />,
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        {actionButtons(row.original).map((action) => (
                            <Dropdown.Item
                                key={action}
                                onClick={() =>
                                    setActionState({
                                        period: row.original,
                                        action,
                                    })
                                }
                            >
                                {action === 'open' ? 'Open' :
                                action === 'restrict' ? 'Restrict' :
                                action === 'close' ? 'Close' :
                                action === 'lock' ? 'Lock' :
                                action === 'reopen' ? 'Reopen' : 'Unlock'}
                            </Dropdown.Item>
                        ))}
                        <Dropdown.Item
                            eventKey="details"
                            onClick={() => {
                                window.location.href = `${ROUTE}/${row.original.id}`
                            }}
                        >
                            <HiOutlinePencil className="text-base" />
                            <span>Details</span>
                        </Dropdown.Item>
                        <Dropdown.Item
                            eventKey="history"
                            onClick={() => {
                                window.location.href = `${ROUTE}/${row.original.id}/history`
                            }}
                        >
                            <HiOutlineLockOpen className="text-base" />
                            <span>History</span>
                        </Dropdown.Item>
                    </Dropdown>
                ),
            },
        ],
        [],
    )

    const periodMobile = useMemo(
        () => ({
            title: (period: FicoPeriod) => `${String(period.periodNumber).padStart(2, '0')}/${period.fiscalYear}`,
            subtitle: (period: FicoPeriod) => period.name ?? null,
            status: (period: FicoPeriod) => ({
                text: period.status,
                tone: ficoStatusTone(period.status, FICO_PERIOD_STATUS),
            }),
            fields: [
                {
                    label: 'Type',
                    value: (period: FicoPeriod) => period.periodType,
                },
                {
                    label: 'Dates',
                    value: (period: FicoPeriod) =>
                        `${new Date(period.startDate).toLocaleDateString()} → ${new Date(period.endDate).toLocaleDateString()}`,
                },
                {
                    label: 'Journals',
                    value: (period: FicoPeriod) => period._count?.journalEntries ?? 0,
                },
                {
                    label: 'Status',
                    value: (period: FicoPeriod) => period.status,
                },
            ],
        }),
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Posting Periods"
                description="Open, restrict, close, lock, reopen and unlock fiscal periods with audited reasons."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full sm:w-auto">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                            className="w-full sm:w-80"
                        />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                variant="solid"
                                onClick={openGenerate}
                                disabled={!companyId}
                                className="w-full sm:w-auto min-w-[140px] text-center font-medium"
                            >
                                <HiOutlinePlus className="w-4 h-4 mr-1.5" />
                                Generate periods
                            </Button>
                        </div>
                    </div>
                }
            />

            <AdaptiveCard className="mb-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <StatCard
                        label="Open"
                        value={summary?.totals.open ?? 0}
                        tone="success"
                        loading={!summary}
                        size="lg"
                    />
                    <StatCard
                        label="Restricted"
                        value={summary?.totals.restricted ?? 0}
                        tone="warning"
                        loading={!summary}
                        size="lg"
                    />
                    <StatCard
                        label="Closed"
                        value={summary?.totals.closed ?? 0}
                        loading={!summary}
                        size="lg"
                    />
                    <StatCard
                        label="Locked"
                        value={summary?.totals.locked ?? 0}
                        tone="danger"
                        loading={!summary}
                        size="lg"
                    />
                    <StatCard
                        label="Future"
                        value={summary?.totals.future ?? 0}
                        tone="info"
                        loading={!summary}
                        size="lg"
                    />
                    <StatCard
                        label="Posted journals"
                        value={summary?.journalEntries ?? 0}
                        loading={!summary}
                        size="lg"
                        badge={
                            summary
                                ? {
                                      tone:
                                          summary.periodsWithPostings > 0
                                              ? 'info'
                                              : 'default',
                                      label: `${summary.periodsWithPostings} period(s) with postings`,
                                  }
                                : undefined
                        }
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mb-6">
                <FilterBar
                    fields={[
                        {
                            key: 'fiscalYear',
                            label: 'Fiscal year',
                            kind: 'select',
                            value: fiscalYear,
                            options: years.map((year) => ({
                                value: String(year.fiscalYear),
                                label: String(year.fiscalYear),
                            })),
                            placeholder: 'Select year',
                            chipLabel: 'Year',
                            onChange: setFiscalYear,
                        },
                        {
                            key: 'status',
                            label: 'Status',
                            kind: 'text',
                            inputType: 'text',
                            value: status,
                            placeholder: 'OPEN, CLOSED…',
                            chipLabel: 'Status',
                            onChange: (v) => setStatus(v.toUpperCase()),
                        },
                    ]}
                    chips={[
                        ...(fiscalYear
                            ? [{
                                  key: 'fiscalYear',
                                  label: `Year ${fiscalYear}`,
                                  onRemove: () => {
                                      setFiscalYear('')
                                      loadPeriods()
                                  },
                              }]
                            : []),
                        ...(status
                            ? [{
                                  key: 'status',
                                  label: `Status ${status}`,
                                  onRemove: () => {
                                      setStatus('')
                                      loadPeriods()
                                  },
                              }]
                            : []),
                    ]}
                    onClear={() => {
                        setFiscalYear('')
                        setStatus('')
                        loadPeriods()
                    }}
                    actions={
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                onClick={loadPeriods}
                                loading={loading}
                                variant="solid"
                                className="w-full sm:w-auto"
                            >
                                <HiOutlineRefresh className="w-4 h-4 mr-1.5" />
                                Apply filters
                            </Button>
                            <Button
                                variant="default"
                                onClick={() => {
                                    setFiscalYear('')
                                    setStatus('')
                                    loadPeriods()
                                }}
                                className="w-full sm:w-auto text-sm"
                            >
                                Reset filters
                            </Button>
                        </div>
                    }
                />
                {summary?.currentPeriod ? (
                    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/60">
                        <div className="flex items-center gap-2">
                            <HiOutlineClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Current period:{' '}
                                <span className="font-mono text-sm">
                                    {String(summary.currentPeriod.periodNumber).padStart(2, '0')}/
                                    {summary.currentPeriod.fiscalYear}
                                </span>{' '}
                                <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide border text-gray-600 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700">
                                    {summary.currentPeriod.status}
                                </span>
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                            Closing never uses GR/IR balances alone. Incomplete
                            documents and unbalanced journals block closing.
                        </p>
                    </div>
                ) : (
                    <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/60">
                        <p className="text-xs text-gray-500">
                            No period covers today.
                        </p>
                    </div>
                )}
                <FicoResponsiveTable<FicoPeriod>
                    columns={columns}
                    data={periods}
                    compact
                    loading={loading}
                    noData={!loading && !periods.length}
                    getRowId={(row) => row.id}
                    rowClassName={(row) =>
                        row.status === 'LOCKED'
                            ? 'bg-red-50/40 dark:bg-red-950/20'
                            : row.status === 'CLOSED'
                              ? 'bg-gray-50/60 dark:bg-gray-900/30'
                              : undefined
                    }
                    tableMinWidthClass="min-w-[900px]"
                    hidePagination
                    mobile={periodMobile}
                    instanceId="fico-posting-periods"
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
                isOpen={generateOpen}
                onClose={() => setGenerateOpen(false)}
                title="Generate accounting periods"
                description="Periods are generated from the saved fiscal year configuration. Existing periods for the same fiscal year are left untouched."
                size="lg"
                onSubmit={submitGenerate}
                confirmText="Generate periods"
                confirmLoading={generating}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Fiscal year">
                        <Input
                            type="number"
                            value={generateForm.fiscalYear}
                            onChange={(event) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    fiscalYear: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Special adjustment periods">
                        <Input
                            type="number"
                            min={0}
                            max={4}
                            value={generateForm.specialPeriodCount}
                            onChange={(event) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    specialPeriodCount: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Fiscal year variant"
                        className="sm:col-span-2"
                    >
                        <Select
                            isClearable={false}
                            placeholder="Select fiscal year variant"
                            options={fiscalVariants.map((variant) => ({
                                value: variant.id,
                                label: `${variant.code} — ${variant.name}`,
                            }))}
                            value={
                                fiscalVariants
                                    .map((variant) => ({
                                        value: variant.id,
                                        label: `${variant.code} — ${variant.name}`,
                                    }))
                                    .find(
                                        (option) =>
                                            option.value ===
                                            generateForm.fiscalYearVariantId,
                                    ) ?? null
                            }
                            onChange={(option) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    fiscalYearVariantId:
                                        (
                                            option as {
                                                value: string;
                                            } | null
                                        )?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem
                        label="Posting period variant"
                        className="sm:col-span-2"
                    >
                        <Select
                            isClearable={false}
                            placeholder="Select posting period variant"
                            options={postingVariants.map((variant) => ({
                                value: variant.id,
                                label: `${variant.code} — ${variant.name}`,
                            }))}
                            value={
                                postingVariants
                                    .map((variant) => ({
                                        value: variant.id,
                                        label: `${variant.code} — ${variant.name}`,
                                    }))
                                    .find(
                                        (option) =>
                                            option.value ===
                                            generateForm.postingPeriodVariantId,
                                    ) ?? null
                            }
                            onChange={(option) =>
                                setGenerateForm((current) => ({
                                    ...current,
                                    postingPeriodVariantId:
                                        (
                                            option as {
                                                value: string;
                                            } | null
                                        )?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                </div>
                <p className="mt-4 text-xs text-gray-500">
                    The generated periods start as FUTURE. Open each period
                    explicitly before posting; closed and locked periods reject
                    postings in the centralized validator.
                </p>
            </FormDialog>
        </PageContainer>
    )
}

export default FiscalPeriodsPage
