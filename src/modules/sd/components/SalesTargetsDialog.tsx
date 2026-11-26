'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import Alert from '@/components/ui/Alert'
import Skeleton from '@/components/ui/Skeleton'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import { HiOutlineTrendingUp } from 'react-icons/hi'
import NumericInput from '@/components/shared/NumericInput'
import {
    fetchSalesTargets,
    saveSalesTargets,
} from '../services/salesAnalyticsService'
import { formatSdMoney } from './SdDataTableCells'

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

const QUARTERS = [
    { label: 'Q1', range: 'Jan – Mar', months: [0, 1, 2] },
    { label: 'Q2', range: 'Apr – Jun', months: [3, 4, 5] },
    { label: 'Q3', range: 'Jul – Sep', months: [6, 7, 8] },
    { label: 'Q4', range: 'Oct – Dec', months: [9, 10, 11] },
] as const

const GRID = 'grid grid-cols-[7.5rem_1fr_1fr] items-center gap-3'

type Draft = { salesTarget: string; collectionQuota: string }

const emptyDrafts = (): Draft[] =>
    Array.from({ length: 12 }, () => ({ salesTarget: '', collectionQuota: '' }))

const toNumber = (value: string) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100

type Props = {
    isOpen: boolean
    /** Calendar year whose 12 monthly targets are edited. */
    year: number
    onClose: () => void
    /** Called after targets were saved so the scorecard can refresh. */
    onSaved: () => void
}

/**
 * Monthly sales targets and collection quotas behind the Sales Analysis
 * scorecard. YTD figures use the sum of January up to the selected month.
 */
const SalesTargetsDialog = ({ isOpen, year, onClose, onSaved }: Props) => {
    const [drafts, setDrafts] = useState<Draft[]>(emptyDrafts)
    const [annualSales, setAnnualSales] = useState('')
    const [annualQuota, setAnnualQuota] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen) return
        let active = true
        setLoading(true)
        setError(null)
        setAnnualSales('')
        setAnnualQuota('')
        fetchSalesTargets(year)
            .then((result) => {
                if (!active) return
                const next = emptyDrafts()
                for (const row of result.months) {
                    next[row.month - 1] = {
                        salesTarget: row.salesTarget
                            ? String(row.salesTarget)
                            : '',
                        collectionQuota: row.collectionQuota
                            ? String(row.collectionQuota)
                            : '',
                    }
                }
                setDrafts(next)
            })
            .catch((err) => {
                if (active)
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load sales targets',
                    )
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [isOpen, year])

    const totals = useMemo(
        () => ({
            sales: drafts.reduce((sum, d) => sum + toNumber(d.salesTarget), 0),
            quota: drafts.reduce(
                (sum, d) => sum + toNumber(d.collectionQuota),
                0,
            ),
        }),
        [drafts],
    )

    const monthsWithTarget = drafts.filter(
        (d) => toNumber(d.salesTarget) > 0,
    ).length
    const coverage =
        totals.sales > 0 ? (totals.quota / totals.sales) * 100 : null
    const currentMonthIndex =
        new Date().getFullYear() === year ? new Date().getMonth() : -1

    const quarterTotals = (months: readonly number[]) => ({
        sales: months.reduce(
            (sum, m) => sum + toNumber(drafts[m].salesTarget),
            0,
        ),
        quota: months.reduce(
            (sum, m) => sum + toNumber(drafts[m].collectionQuota),
            0,
        ),
    })

    const update = (index: number, patch: Partial<Draft>) =>
        setDrafts((rows) =>
            rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        )

    const splitEvenly = () => {
        const sales = toNumber(annualSales)
        const quota = toNumber(annualQuota)
        if (!sales && !quota) return
        setDrafts((rows) =>
            rows.map((row) => ({
                salesTarget: sales
                    ? String(round2(sales / 12))
                    : row.salesTarget,
                collectionQuota: quota
                    ? String(round2(quota / 12))
                    : row.collectionQuota,
            })),
        )
    }

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            await saveSalesTargets({
                year,
                months: drafts.map((draft, index) => ({
                    month: index + 1,
                    salesTarget: toNumber(draft.salesTarget),
                    collectionQuota: toNumber(draft.collectionQuota),
                })),
            })
            toast.push(
                <Notification type="success" title="Targets saved">
                    {year} sales targets and collection quotas were updated.
                </Notification>,
            )
            onSaved()
            onClose()
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to save sales targets',
            )
        } finally {
            setSaving(false)
        }
    }

    const numericProps = {
        placeholder: '0.00',
        thousandSeparator: ',',
        decimalScale: 2,
        allowNegative: false,
    } as const

    const summaryTiles = [
        {
            label: 'Annual sales target',
            value: formatSdMoney(totals.sales, 'PHP'),
            hint: `${monthsWithTarget} of 12 months set`,
        },
        {
            label: 'Annual collection quota',
            value: formatSdMoney(totals.quota, 'PHP'),
            hint: 'Sum of monthly quotas',
        },
        {
            label: 'Quota vs target',
            value: coverage === null ? '—' : `${coverage.toFixed(1)}%`,
            hint: 'Collection quota ÷ sales target',
        },
    ]

    return (
        <Dialog
            isOpen={isOpen}
            width={720}
            onClose={onClose}
            onRequestClose={onClose}
            contentClassName="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden !p-0"
        >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-gray-200 px-6 py-5 pr-14 dark:border-gray-700">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-xl text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                    <HiOutlineTrendingUp />
                </span>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h5 className="mb-0">
                            Sales targets &amp; collection quotas
                        </h5>
                        <Tag className="border-0 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                            FY {year}
                        </Tag>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Set a target for each month. Year-to-date figures sum
                        January through the selected month; a blank month means
                        no target.
                    </p>
                </div>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {error ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {error}
                    </Alert>
                ) : null}

                {/* Summary */}
                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {summaryTiles.map((tile) => (
                        <div
                            key={tile.label}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-700/30"
                        >
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {tile.label}
                            </p>
                            <p className="mt-1 text-lg font-bold tabular-nums heading-text">
                                {tile.value}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {tile.hint}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Quick fill */}
                <div className="mb-5 rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
                    <div className="mb-3">
                        <p className="text-sm font-semibold heading-text">
                            Quick fill
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Enter an annual amount and spread it evenly over 12
                            months. You can still adjust each month afterwards.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                                Annual sales target
                            </label>
                            <NumericInput
                                {...numericProps}
                                inputPrefix="₱"
                                value={annualSales}
                                onValueChange={(v) =>
                                    setAnnualSales(v.value ?? '')
                                }
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                                Annual collection quota
                            </label>
                            <NumericInput
                                {...numericProps}
                                inputPrefix="₱"
                                value={annualQuota}
                                onValueChange={(v) =>
                                    setAnnualQuota(v.value ?? '')
                                }
                            />
                        </div>
                        <Button
                            disabled={
                                !toNumber(annualSales) && !toNumber(annualQuota)
                            }
                            onClick={splitEvenly}
                        >
                            Split evenly
                        </Button>
                    </div>
                </div>

                {/* Monthly schedule */}
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <div
                        className={`${GRID} border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-700/40 dark:text-gray-400`}
                    >
                        <span>Month</span>
                        <span>Sales target</span>
                        <span>Collection quota</span>
                    </div>

                    {loading ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} height={36} />
                            ))}
                        </div>
                    ) : (
                        QUARTERS.map((quarter) => {
                            const sub = quarterTotals(quarter.months)
                            return (
                                <div key={quarter.label}>
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/70 px-4 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-700/20">
                                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                                            {quarter.label}
                                            <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                                                {quarter.range}
                                            </span>
                                        </span>
                                        <span className="tabular-nums text-gray-500 dark:text-gray-400">
                                            {formatSdMoney(sub.sales, 'PHP')}
                                            <span className="mx-1.5">·</span>
                                            {formatSdMoney(sub.quota, 'PHP')}
                                        </span>
                                    </div>
                                    {quarter.months.map((index) => {
                                        const draft = drafts[index]
                                        const isCurrent =
                                            index === currentMonthIndex
                                        return (
                                            <div
                                                key={MONTH_NAMES[index]}
                                                className={`${GRID} border-b border-gray-100 px-4 py-2 last:border-b-0 dark:border-gray-700/60 ${
                                                    isCurrent
                                                        ? 'bg-primary-subtle/40 dark:bg-primary/10'
                                                        : ''
                                                }`}
                                            >
                                                <span className="flex items-center gap-2 text-sm font-medium heading-text">
                                                    {MONTH_NAMES[index]}
                                                    {isCurrent ? (
                                                        <span className="rounded-full bg-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-deep dark:bg-primary/20 dark:text-primary-light">
                                                            Now
                                                        </span>
                                                    ) : null}
                                                </span>
                                                <NumericInput
                                                    {...numericProps}
                                                    inputPrefix="₱"
                                                    value={draft.salesTarget}
                                                    onValueChange={(v) =>
                                                        update(index, {
                                                            salesTarget:
                                                                v.value ?? '',
                                                        })
                                                    }
                                                />
                                                <NumericInput
                                                    {...numericProps}
                                                    inputPrefix="₱"
                                                    value={
                                                        draft.collectionQuota
                                                    }
                                                    onValueChange={(v) =>
                                                        update(index, {
                                                            collectionQuota:
                                                                v.value ?? '',
                                                        })
                                                    }
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })
                    )}

                    <div
                        className={`${GRID} border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold dark:border-gray-700 dark:bg-gray-700/40`}
                    >
                        <span>Total {year}</span>
                        <span className="tabular-nums heading-text">
                            {formatSdMoney(totals.sales, 'PHP')}
                        </span>
                        <span className="tabular-nums heading-text">
                            {formatSdMoney(totals.quota, 'PHP')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Changes apply to the Sales Analysis scorecard after saving.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="plain" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={saving}
                        disabled={loading}
                        onClick={save}
                    >
                        Save targets
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default SalesTargetsDialog
