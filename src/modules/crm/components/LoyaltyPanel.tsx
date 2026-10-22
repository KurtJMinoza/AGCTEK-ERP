'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import DataTable from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import CrmSelect from './CrmSelect'
import { apiMockEarnLoyalty } from '../services/crmApi'
import type { Customer360Order, LoyaltySummary, LoyaltyTransaction } from '../types'
import { crmTone, formatDate, formatEnumLabel, formatMoney } from '../utils/format'

/** Rows posted by the mock (no invoice behind them); real earn will reference the FICO invoice. */
const MOCK_REFERENCE_TYPES: ReadonlySet<string> = new Set(['MOCK', 'SALES_ORDER'])
const NOT_EARNING_ORDER_STATUSES: ReadonlySet<string> = new Set(['DRAFT', 'CANCELLED'])

const TIER_TONE: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
    BRONZE: 'default',
    SILVER: 'info',
    GOLD: 'warning',
    PLATINUM: 'success',
}

const isMock = (row: LoyaltyTransaction) => MOCK_REFERENCE_TYPES.has(row.referenceType ?? '')

type LoyaltyPanelProps = {
    loyalty: LoyaltySummary | null
    loading?: boolean
    error?: string | null
    /** Customer whose ledger this is (needed for mock earn). */
    customerId?: string
    /** The customer's SD orders (Customer 360) offered for a mock earn. */
    orders?: Customer360Order[]
    /** crm.loyalty update; the control also needs the server's mock switch. */
    canMockEarn?: boolean
    /** After a mock earn posted. */
    onChanged?: () => void
}

export default function LoyaltyPanel({
    loyalty,
    loading,
    error,
    customerId,
    orders = [],
    canMockEarn = false,
    onChanged,
}: LoyaltyPanelProps) {
    const [dialogOpen, setDialogOpen] = useState(false)
    const [salesOrderId, setSalesOrderId] = useState<string | null>(null)
    const [points, setPoints] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const columns = useMemo<ColumnDef<LoyaltyTransaction>[]>(
        () => [
            { header: 'Date', cell: ({ row }) => formatDate(row.original.createdAt) },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1">
                        <StatusBadge>{formatEnumLabel(row.original.type)}</StatusBadge>
                        {isMock(row.original) ? <StatusBadge tone="warning">Mock</StatusBadge> : null}
                    </span>
                ),
            },
            {
                header: 'Points',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.points < 0
                                ? 'tabular-nums text-red-600'
                                : 'tabular-nums text-emerald-600'
                        }
                    >
                        {row.original.points > 0 ? '+' : ''}
                        {row.original.points}
                    </span>
                ),
            },
            {
                header: 'Reference',
                cell: ({ row }) => (row.original.referenceType ? formatEnumLabel(row.original.referenceType) : '—'),
            },
            { header: 'Note', cell: ({ row }) => row.original.note || '—' },
        ],
        [],
    )

    const earningOrders = orders.filter((o) => !NOT_EARNING_ORDER_STATUSES.has(o.status))
    const orderOptions = earningOrders.map((o) => ({
        value: o.id,
        label: `${o.orderNumber} · ${formatEnumLabel(o.status)} · ${formatMoney(o.totalAmount === null ? null : Number(o.totalAmount), o.currency)}`,
    }))
    const pointsValue = Number(points)
    const validPoints = Number.isInteger(pointsValue) && pointsValue > 0
    const canSubmit = Boolean(salesOrderId) || validPoints
    const showMockControl = Boolean(customerId && canMockEarn && loyalty?.mockAccrual)

    const openDialog = () => {
        setSalesOrderId(null)
        setPoints('')
        setNote('')
        setFormError(null)
        setDialogOpen(true)
    }

    const submit = async () => {
        if (!customerId || !canSubmit) return
        setSaving(true)
        setFormError(null)
        try {
            const result = await apiMockEarnLoyalty(
                customerId,
                salesOrderId
                    ? { salesOrderId, note: note.trim() || undefined }
                    : { points: pointsValue, note: note.trim() || undefined },
            )
            setDialogOpen(false)
            setNotice(
                result.created
                    ? `Mock earn posted: +${result.transaction.points} points (balance ${result.summary.pointsBalance}).`
                    : 'This sales order already earned points; nothing changed.',
            )
            onChanged?.()
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Mock earn failed'))
        } finally {
            setSaving(false)
        }
    }

    if (error) {
        return (
            <Alert showIcon type="danger">
                {error}
            </Alert>
        )
    }

    const hasAccount = Boolean(loyalty?.accountId)

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-500">Balance</span>
                <span className="text-xl font-semibold tabular-nums">
                    {loyalty ? loyalty.pointsBalance.toLocaleString() : '—'}
                </span>
                <span className="text-sm text-gray-500">points</span>
                {loyalty?.tier ? (
                    <StatusBadge tone={TIER_TONE[loyalty.tier] ?? crmTone(loyalty.tier)}>
                        {formatEnumLabel(loyalty.tier)}
                    </StatusBadge>
                ) : null}
                {loyalty?.mockAccrual ? (
                    <StatusBadge tone="warning">Mock accrual on · not invoice-backed</StatusBadge>
                ) : null}
                {showMockControl ? (
                    <Button size="sm" className="ml-auto" onClick={openDialog}>
                        Mock earn
                    </Button>
                ) : null}
            </div>

            {notice ? (
                <Alert showIcon closable type="success" onClose={() => setNotice(null)}>
                    {notice}
                </Alert>
            ) : null}

            {!loading && loyalty && !hasAccount ? (
                <p className="text-sm text-gray-500">
                    No loyalty account yet. It opens with the first earn
                    {loyalty.mockAccrual
                        ? ' (mock earn is on for demos).'
                        : '; points from paid invoices arrive once finance (FICO) accrual is live.'}
                </p>
            ) : (
                <DataTable
                    columns={columns}
                    data={loyalty?.transactions ?? []}
                    loading={loading}
                    noData={!loading && (loyalty?.transactions.length ?? 0) === 0}
                    hidePagination
                />
            )}

            <FormDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                title="Mock earn"
                description="Demo / staging only. Posts real ledger rows without an invoice behind them; real points will come from finance (FICO)."
                onSubmit={canSubmit ? submit : undefined}
                confirmText="Post mock earn"
                confirmLoading={saving}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <FormItem label="Sales order (earns 1 point per 100 PHP by default; once per order)">
                    <CrmSelect
                        options={orderOptions}
                        value={salesOrderId}
                        isClearable
                        placeholder={orderOptions.length ? 'Select an order' : 'No eligible orders'}
                        onChange={(id) => setSalesOrderId(id)}
                    />
                </FormItem>
                <FormItem label="…or grant points">
                    <Input
                        type="number"
                        min={1}
                        step={1}
                        value={points}
                        disabled={Boolean(salesOrderId)}
                        placeholder="e.g. 500"
                        onChange={(e) => setPoints(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Note (optional)">
                    <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                </FormItem>
            </FormDialog>
        </div>
    )
}
