'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineDocument,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
} from '../components/FicoCompanySelect'
import {
    FicoStatusCell,
    FICO_PERIOD_STATUS,
    formatFicoDate,
} from '../components/ficoTableUi'
import { ficoPeriodService } from '../services/ficoService'
import type { FicoPeriodDetail, FicoPeriodHistoryEntry } from '../types'

const ROUTE = '/modules/fico/fiscal-periods'

type PeriodAction =
    | 'open'
    | 'restrict'
    | 'close'
    | 'lock'
    | 'reopen'
    | 'unlock'

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
    restrict:
        'Automatic postings remain allowed, but manual postings are blocked.',
    close:
        'Closing checks for incomplete or unbalanced documents. The action is recorded in the audit trail.',
    lock: 'A locked period cannot be posted to and requires the privileged unlock action.',
    reopen:
        'Reopening a closed period requires a reason and is audited. Use this only for approved corrections.',
    unlock:
        'Unlocking a locked period requires a reason and the separate period-unlock permission. It is audited.',
}

const ACTION_VARIANTS: Record<PeriodAction, 'solid' | 'plain' | 'default'> = {
    open: 'solid',
    restrict: 'default',
    close: 'default',
    lock: 'default',
    reopen: 'default',
    unlock: 'default',
}

const ACTION_TONES: Record<PeriodAction, string> = {
    open: 'bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/10',
    restrict: 'bg-amber-50/60 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-200 dark:border-amber-800/30 hover:bg-amber-50 dark:hover:bg-amber-950/10',
    close: 'bg-rose-50/60 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-rose-200 dark:border-rose-800/30 hover:bg-rose-50 dark:hover:bg-rose-950/10',
    lock: 'bg-rose-50/60 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-rose-200 dark:border-rose-800/30 hover:bg-rose-50 dark:hover:bg-rose-950/10',
    reopen: 'bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/10',
    unlock: 'bg-blue-50/60 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border-blue-200 dark:border-blue-800/30 hover:bg-blue-50 dark:hover:bg-blue-950/10',
}

function actionButtons(status: string): PeriodAction[] {
    if (status === 'FUTURE') return ['open']
    if (status === 'OPEN') return ['restrict', 'close']
    if (status === 'RESTRICTED') return ['open', 'close']
    if (status === 'CLOSED') return ['reopen', 'lock']
    if (status === 'LOCKED') return ['unlock']
    return []
}

const detailField = (
    icon: React.ReactElement,
    label: string,
    value: React.ReactNode,
    colSpan?: number,
) => (
    <div
        className={`flex items-start gap-3 p-3 rounded-lg bg-gray-50/40 dark:bg-gray-900/20 ${colSpan ? `sm:col-span-${colSpan} lg:col-span-${colSpan}` : ''}`}
    >
        <div className="flex shrink-0 items-center justify-center w-8 h-8 rounded bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light">
            {icon}
        </div>
        <div className="min-w-0 flex-1">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
                {label}
            </dt>
            <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
                {value}
            </dd>
        </div>
    </div>
)

const PeriodDetailsPage = () => {
    const params = useParams()
    const periodId = String(params?.id ?? '')
    const [period, setPeriod] = useState<FicoPeriodDetail | null>(null)
    const [history, setHistory] = useState<FicoPeriodHistoryEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [actionState, setActionState] = useState<PeriodAction | null>(null)
    const [reason, setReason] = useState('')
    const [form, setForm] = useState({
        remarks: '',
        closingDate: '',
        lockDate: '',
    })

    const load = useCallback(async () => {
        if (!periodId) return
        setLoading(true)
        try {
            const [detail, entries] = await Promise.all([
                ficoPeriodService.get(periodId),
                ficoPeriodService.history(periodId),
            ])
            setPeriod(detail)
            setHistory(entries)
            setForm({
                remarks: detail.remarks ?? '',
                closingDate: detail.closingDate?.slice(0, 10) ?? '',
                lockDate: detail.lockDate?.slice(0, 10) ?? '',
            })
        } catch (error) {
            notifyError(error, 'Unable to load the accounting period.')
        } finally {
            setLoading(false)
        }
    }, [periodId])

    useEffect(() => {
        load()
    }, [load])

    const saveDetails = async () => {
        if (!period) return
        setSaving(true)
        try {
            await ficoPeriodService.update(period.id, {
                remarks: form.remarks || null,
                closingDate: form.closingDate || null,
                lockDate: form.lockDate || null,
            })
            notifySuccess('Period details updated.')
            setEditOpen(false)
            await load()
        } catch (error) {
            notifyError(error, 'Unable to update the period details.')
        } finally {
            setSaving(false)
        }
    }

    const executeAction = async () => {
        if (!period || !actionState) return
        if (
            (actionState === 'reopen' || actionState === 'unlock') &&
            reason.trim().length < 3
        ) {
            notifyError(null, 'A reason of at least 3 characters is required.')
            return
        }
        setSaving(true)
        try {
            await ficoPeriodService.action(
                period.id,
                actionState,
                period.companyId,
                reason.trim() || undefined,
            )
            notifySuccess(`${ACTION_LABELS[actionState]} completed.`)
            setActionState(null)
            setReason('')
            await load()
        } catch (error) {
            notifyError(error, 'Unable to change the period status.')
        } finally {
            setSaving(false)
        }
    }

    const periodLabel = useMemo(
        () =>
            period
                ? `${String(period.periodNumber).padStart(2, '0')}/${period.fiscalYear}`
                : 'Accounting period',
        [period],
    )

    const statusTone = useMemo(
        () => FICO_PERIOD_STATUS[period?.status ?? ''] ?? 'default',
        [period?.status],
    )

    const daysInPeriod = useMemo(() => {
        if (!period) return 0
        return (
            Math.ceil(
                (new Date(period.endDate).getTime() -
                    new Date(period.startDate).getTime()) /
                    (1000 * 60 * 60 * 24),
            ) + 1
        )
    }, [period])

    return (
        <PageContainer>
            <PageHeader
                title={periodLabel}
                description={`Accounting period ${period?.name ? `— ${period.name}` : ''} details, control dates and status history.`}
                breadcrumbs={buildErpBreadcrumbs(`${ROUTE}/${periodId}`, {
                    detailLabel: period?.name || periodLabel,
                })}
                actions={
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 w-full sm:w-auto">
                        <button
                            onClick={load}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg w-full sm:w-auto"
                        >
                            <HiOutlineRefresh className="w-4 h-4" />
                            Refresh
                        </button>
                        <Link
                            href={ROUTE}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:underline rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors w-full sm:w-auto text-center sm:text-left"
                        >
                            <HiOutlinePlus className="w-4 h-4" />{' '}
                            Back to periods
                        </Link>
                        <Link
                            href={`${ROUTE}/${periodId}/history`}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:underline rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors w-full sm:w-auto text-center sm:text-left"
                        >
                            <HiOutlineClipboardList className="w-4 h-4" />{' '}
                            Full history
                        </Link>
                    </div>
                }
            />

            {period ? (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                        <StatCard
                            label="Status"
                            value={
                                <FicoStatusCell
                                    status={period.status}
                                    map={FICO_PERIOD_STATUS}
                                />
                            }
                            tone={statusTone}
                            loading={loading}
                            size="lg"
                        />
                        <StatCard
                            label="Journal entries"
                            value={period._count?.journalEntries ?? 0}
                            tone="default"
                            size="lg"
                        />
                        <StatCard
                            label="Fiscal year"
                            value={period.fiscalYear}
                            tone="info"
                            size="lg"
                        />
                        <StatCard
                            label="Period type"
                            value={period.periodType}
                            tone="default"
                            size="lg"
                        />
                        <StatCard
                            label="Days in period"
                            value={daysInPeriod}
                            tone="default"
                            size="lg"
                        />
                    </div>

                    <AdaptiveCard className="mb-6">
                        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <HiOutlineCalendar className="w-5 h-5 text-primary" />
                                <h3 className="text-base font-semibold">
                                    Period details
                                </h3>
                            </div>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={() => setEditOpen(true)}
                                className="w-auto shrink-0"
                            >
                                <HiOutlinePencil className="w-4 h-4" />
                                Edit details
                            </Button>
                        </div>
                        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {detailField(
                                <HiOutlineDocument className="w-4 h-4" />,
                                'Company',
                                period.company
                                    ? `${period.company.code} — ${period.company.name}`
                                    : period.companyId,
                            )}
                            {detailField(
                                <HiOutlineDocument className="w-4 h-4" />,
                                'Period name',
                                period.name || '—',
                            )}
                            {detailField(
                                <HiOutlineCalendar className="w-4 h-4" />,
                                'Fiscal year variant',
                                period.fiscalYearVariant
                                    ? `${period.fiscalYearVariant.code} — ${period.fiscalYearVariant.name}`
                                    : '—',
                            )}
                            {detailField(
                                <HiOutlineCalendar className="w-4 h-4" />,
                                'Start date',
                                formatFicoDate(period.startDate),
                            )}
                            {detailField(
                                <HiOutlineCalendar className="w-4 h-4" />,
                                'End date',
                                formatFicoDate(period.endDate),
                            )}
                            {detailField(
                                <HiOutlineLockClosed className="w-4 h-4" />,
                                'Closing date',
                                formatFicoDate(period.closingDate),
                            )}
                            {detailField(
                                <HiOutlineLockClosed className="w-4 h-4" />,
                                'Lock date',
                                formatFicoDate(period.lockDate),
                            )}
                            {detailField(
                                <HiOutlineDocument className="w-4 h-4" />,
                                'Remarks',
                                period.remarks || '—',
                                2,
                            )}
                            {detailField(
                                <HiOutlineDocument className="w-4 h-4" />,
                                'Status reason',
                                period.statusReason || '—',
                                2,
                            )}
                        </dl>
                    </AdaptiveCard>

                    <AdaptiveCard className="mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2 w-full sm:w-auto">
                                <div className="flex items-center gap-2">
                                    <HiOutlineLockClosed className="w-5 h-5 text-primary" />
                                    <div>
                                        <h3 className="text-base font-semibold">
                                            Status actions
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            Only open periods accept normal postings.
                                            Closed periods reject postings; locked
                                            periods reject all postings including
                                            adjustments.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                {actionButtons(period.status).map((action) => (
                                    <Button
                                        key={action}
                                        size="sm"
                                        variant={ACTION_VARIANTS[action]}
                                        className={
                                            (ACTION_VARIANTS[action] === 'solid'
                                                ? ''
                                                : ACTION_TONES[action]) +
                                                ' w-full sm:w-auto min-w-[100px] text-center font-medium'
                                        }
                                        onClick={() => {
                                            setActionState(action)
                                            setReason('')
                                        }}
                                    >
                                        {ACTION_LABELS[action]}
                                    </Button>
                                ))}
                                {!actionButtons(period.status).length ? (
                                    <span className="text-sm text-gray-500">
                                        No transition is available from this
                                        status.
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </AdaptiveCard>

                    <AdaptiveCard>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <HiOutlineClock className="w-5 h-5 text-primary" />
                                <h3 className="text-base font-semibold">
                                    Recent status history
                                </h3>
                            </div>
                            <Link
                                href={`${ROUTE}/${periodId}/history`}
                                className="text-sm font-medium text-primary hover:underline"
                            >
                                View all
                            </Link>
                        </div>
                        {history.length ? (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {history.slice(0, 5).map((entry) => (
                                    <li
                                        key={entry.id}
                                        className="py-3 text-sm group hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                                    {entry.action.replace(
                                                        /_/g,
                                                        ' ',
                                                    )}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                                                        {entry.fromStatus ?? '—'}
                                                    </span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
                                                        → {entry.toStatus ?? '—'}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {new Date(
                                                    entry.createdAt,
                                                ).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {entry.actorId
                                                ? `By ${entry.actorId}`
                                                : ''}
                                            {entry.reason ? ` · ${entry.reason}` : ''}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="py-6 text-center">
                                <HiOutlineDocument className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">
                                    No status history has been recorded for this
                                    period.
                                </p>
                            </div>
                        )}
                    </AdaptiveCard>
                </>
            ) : (
                <AdaptiveCard className="py-12 text-center">
                    <HiOutlineDocument className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm text-gray-500">
                        {loading
                            ? 'Loading accounting period…'
                            : 'The accounting period could not be loaded.'}
                    </p>
                </AdaptiveCard>
            )}

            <FormDialog
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                title={`Edit period details — ${periodLabel}`}
                description={
                    'Closing and lock dates are business control dates. They are recorded in the audit trail together with the remarks.'
                }
                onSubmit={saveDetails}
                confirmText="Save details"
                confirmLoading={saving}
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Closing date">
                        <Input
                            type="date"
                            value={form.closingDate}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    closingDate: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Lock date">
                        <Input
                            type="date"
                            value={form.lockDate}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    lockDate: event.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Remarks" className="sm:col-span-2">
                        <Input
                            textArea
                            rows={4}
                            value={form.remarks}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    remarks: event.target.value,
                                }))
                            }
                            placeholder="Notes for finance reviewers and auditors."
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={Boolean(actionState)}
                onClose={() => {
                    setActionState(null)
                    setReason('')
                }}
                title={
                    actionState
                        ? `${ACTION_LABELS[actionState]} — ${periodLabel}`
                        : ''
                }
                description={
                    actionState ? ACTION_DESCRIPTIONS[actionState] : undefined
                }
                onSubmit={executeAction}
                confirmText={
                    actionState ? ACTION_LABELS[actionState] : 'Confirm'
                }
                confirmLoading={saving}
            >
                <FormItem
                    label={
                        actionState === 'reopen' || actionState === 'unlock'
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
        </PageContainer>
    )
}

export default PeriodDetailsPage
