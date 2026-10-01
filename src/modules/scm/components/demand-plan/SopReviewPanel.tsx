'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import { apiUpdateDemandPlan } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type { DemandPlanAdjustment, DemandPlanDetail } from '../../types'

type Props = {
    plan: DemandPlanDetail | null
    /** Warehouse name by location code, from the grid payload. */
    locationNames?: Record<string, string>
    onSaved: () => void
}

const fmt = (n: number | null) =>
    n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

/**
 * S&OP Review layer on the same plan: consensus notes + audited overrides.
 * Consensus quantities per cell are a later phase.
 */
export default function SopReviewPanel({ plan, locationNames, onSaved }: Props) {
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setNotes(plan?.notes ?? '')
        setError(null)
    }, [plan?.id, plan?.notes])

    const columns = useMemo<ColumnDef<DemandPlanAdjustment>[]>(
        () => [
            {
                header: 'When',
                cell: ({ row }) =>
                    new Date(row.original.createdAt).toLocaleString(),
            },
            {
                header: 'Product',
                cell: ({ row }) => row.original.forecast?.productCode ?? '—',
            },
            {
                header: 'Location',
                cell: ({ row }) => {
                    const code = row.original.forecast?.locationCode
                    return code ? (locationNames?.[code] ?? code) : '—'
                },
            },
            {
                header: 'Week of',
                cell: ({ row }) =>
                    row.original.forecast
                        ? row.original.forecast.periodStart.slice(0, 10)
                        : '—',
            },
            {
                header: 'From → To',
                cell: ({ row }) =>
                    `${fmt(row.original.previousQty)} → ${fmt(row.original.newQty)}`,
            },
            { header: 'Reason', accessorKey: 'reason' },
            {
                header: 'By',
                cell: ({ row }) => row.original.adjustedBy ?? '—',
            },
        ],
        [locationNames],
    )

    if (!plan) return null
    const locked = plan.status === 'PUBLISHED'

    const saveNotes = async () => {
        setSaving(true)
        setError(null)
        try {
            await apiUpdateDemandPlan(plan.id, { notes: notes.trim() || null })
            onSaved()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save review notes'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h6 className="mb-1">Consensus notes</h6>
                <p className="mb-2 text-sm text-gray-500">
                    Assumptions and decisions agreed in the S&amp;OP review for{' '}
                    {plan.code}.
                </p>
                {error ? (
                    <Alert showIcon type="danger" className="mb-2">
                        {error}
                    </Alert>
                ) : null}
                <Input
                    textArea
                    value={notes}
                    disabled={locked}
                    onChange={(e) => setNotes(e.target.value)}
                />
                {!locked ? (
                    <div className="mt-2 flex justify-end">
                        <Button
                            size="sm"
                            loading={saving}
                            disabled={notes === (plan.notes ?? '')}
                            onClick={() => void saveNotes()}
                        >
                            Save notes
                        </Button>
                    </div>
                ) : null}
            </div>

            <div>
                <h6 className="mb-1">Override audit</h6>
                <p className="mb-2 text-sm text-gray-500">
                    Latest {plan.adjustments.length} of{' '}
                    {plan._count?.adjustments ?? plan.adjustments.length} manual
                    overrides with reasons.
                </p>
                <DataTable
                    columns={columns}
                    data={plan.adjustments}
                    noData={plan.adjustments.length === 0}
                    hidePagination
                    pagingData={{
                        total: plan.adjustments.length,
                        pageIndex: 1,
                        pageSize: Math.max(plan.adjustments.length, 10),
                    }}
                />
            </div>
        </div>
    )
}
