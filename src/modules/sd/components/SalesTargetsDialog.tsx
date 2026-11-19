'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import Alert from '@/components/ui/Alert'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
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

type Draft = { salesTarget: string; collectionQuota: string }

const emptyDrafts = (): Draft[] =>
    Array.from({ length: 12 }, () => ({ salesTarget: '', collectionQuota: '' }))

const toNumber = (value: string) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

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
                salesTarget: sales ? String(round2(sales / 12)) : row.salesTarget,
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
                err instanceof Error ? err.message : 'Unable to save sales targets',
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

    return (
        <Dialog
            isOpen={isOpen}
            width={640}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1">Sales targets &amp; collection quotas</h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                {year} · enter a target per month. YTD uses January through the
                selected month; leave a month empty for no target.
            </p>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/40 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                        Annual sales target
                    </label>
                    <NumericInput
                        {...numericProps}
                        inputPrefix="₱"
                        value={annualSales}
                        onValueChange={(v) => setAnnualSales(v.value ?? '')}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                        Annual collection quota
                    </label>
                    <NumericInput
                        {...numericProps}
                        inputPrefix="₱"
                        value={annualQuota}
                        onValueChange={(v) => setAnnualQuota(v.value ?? '')}
                    />
                </div>
                <Button
                    size="sm"
                    disabled={!toNumber(annualSales) && !toNumber(annualQuota)}
                    onClick={splitEvenly}
                >
                    Split evenly
                </Button>
            </div>

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} height={36} />
                    ))}
                </div>
            ) : (
                <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <div className="sticky top-0 z-10 grid grid-cols-[7rem_1fr_1fr] gap-2 bg-white pb-2 text-xs font-semibold uppercase text-gray-500 dark:bg-gray-800">
                        <span>Month</span>
                        <span>Sales target</span>
                        <span>Collection quota</span>
                    </div>
                    <div className="space-y-2">
                        {drafts.map((draft, index) => (
                            <div
                                key={MONTH_NAMES[index]}
                                className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2"
                            >
                                <span className="text-sm font-medium heading-text">
                                    {MONTH_NAMES[index]}
                                </span>
                                <NumericInput
                                    {...numericProps}
                                    inputPrefix="₱"
                                    value={draft.salesTarget}
                                    onValueChange={(v) =>
                                        update(index, {
                                            salesTarget: v.value ?? '',
                                        })
                                    }
                                />
                                <NumericInput
                                    {...numericProps}
                                    inputPrefix="₱"
                                    value={draft.collectionQuota}
                                    onValueChange={(v) =>
                                        update(index, {
                                            collectionQuota: v.value ?? '',
                                        })
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-3 grid grid-cols-[7rem_1fr_1fr] gap-2 border-t border-gray-200 pt-3 text-sm font-semibold dark:border-gray-700">
                <span>Total</span>
                <span className="tabular-nums">
                    {formatSdMoney(totals.sales, 'PHP')}
                </span>
                <span className="tabular-nums">
                    {formatSdMoney(totals.quota, 'PHP')}
                </span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
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
        </Dialog>
    )
}

export default SalesTargetsDialog
