'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    HiOutlineArrowNarrowRight,
    HiOutlineBan,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineReceiptRefund,
    HiOutlineSearch,
    HiOutlineTrendingUp,
} from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import type { PosReceipt } from '../services/posService'

type Props = {
    isOpen: boolean
    loading?: boolean
    receipts: PosReceipt[]
    /** Rows added by the cashier's last sale / void; shown highlighted. */
    newKeys?: ReadonlySet<string>
    onClose: () => void
    /** Opens the receipt of a sale (reprint). */
    onShowReceipt: (receipt: PosReceipt) => void
    /** Opens the void dialog of a sale. */
    onVoid: (receipt: PosReceipt) => void
    /** Finishes a sale whose checkout stopped before completion. */
    onComplete: (receipt: PosReceipt) => void
    /** Sale currently being completed. */
    completingId?: string | null
    formatPrice: (value: number) => string
}

type Filter = 'ALL' | 'COMPLETED' | 'VOIDED' | 'PENDING'

const TENDER_LABEL: Record<string, string> = {
    CASH: 'Cash',
    GCASH: 'GCash',
    BANK_TRANSFER: 'Bank transfer',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    SALARY_LOAN: 'Salary deduction',
}

/** Stable identity of a history row (a sale and its void share the order id). */
export const posReceiptKey = (receipt: PosReceipt) =>
    `${receipt.salesOrderId}-${receipt.transactionType ?? 'SALE'}`

const isVoidRow = (r: PosReceipt) => r.transactionType === 'VOID'

const matchesFilter = (r: PosReceipt, filter: Filter) => {
    if (filter === 'ALL') return true
    if (filter === 'VOIDED') return isVoidRow(r) || r.status === 'CANCELLED'
    if (isVoidRow(r)) return false
    return filter === 'PENDING' ? r.status === 'CONFIRMED' : r.status === 'COMPLETED'
}

/** Product images of the first lines of a sale (stacked, initials when no photo). */
const ProductThumbnails = ({ receipt }: { receipt: PosReceipt }) => {
    const lines = receipt.lines.slice(0, 3)
    if (!lines.length) {
        return (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-500 dark:bg-red-500/15">
                <HiOutlineReceiptRefund className="h-5 w-5" />
            </div>
        )
    }
    return (
        <div className="flex shrink-0 items-center">
            {lines.map((line, index) => {
                const label = line.description ?? line.sku
                return (
                    <div
                        key={`${line.sku}-${index}`}
                        title={label}
                        className={classNames(
                            'h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800',
                            index > 0 && '-ml-4 ring-2 ring-white dark:ring-gray-900',
                        )}
                    >
                        {line.imageUrl ? (
                            <img src={line.imageUrl} alt={label} className="h-full w-full object-cover" />
                        ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-300">
                                {label.trim().slice(0, 2)}
                            </span>
                        )}
                    </div>
                )
            })}
            {receipt.lines.length > 3 ? (
                <span className="-ml-4 flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-[10px] font-semibold tabular-nums text-gray-500 ring-2 ring-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-900">
                    +{receipt.lines.length - 3}
                </span>
            ) : null}
        </div>
    )
}

const SummaryTile = ({
    icon,
    label,
    value,
    sub,
    tone,
}: {
    icon: ReactNode
    label: string
    value: string
    sub?: string
    tone: 'primary' | 'emerald' | 'red' | 'amber'
}) => {
    const toneClass = {
        primary: 'bg-primary-subtle text-primary',
        emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
        red: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
        amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    }[tone]
    return (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
            <span className={classNames('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg', toneClass)}>
                {icon}
            </span>
            <div className="min-w-0">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
                <div className="truncate text-base font-bold tabular-nums heading-text">{value}</div>
                {sub ? <div className="text-[11px] text-gray-400">{sub}</div> : null}
            </div>
        </div>
    )
}

/**
 * The POS sales of the register: reprint a receipt or void a sale that was
 * completed by mistake. A voided sale is followed by its void transaction.
 */
const POSTransactionsDialog = ({
    isOpen,
    loading = false,
    receipts,
    newKeys,
    onClose,
    onShowReceipt,
    onVoid,
    onComplete,
    completingId = null,
    formatPrice,
}: Props) => {
    const [filter, setFilter] = useState<Filter>('ALL')
    const [query, setQuery] = useState('')

    const handleClose = () => {
        setFilter('ALL')
        setQuery('')
        onClose()
    }

    const summary = useMemo(() => {
        const sales = receipts.filter((r) => !isVoidRow(r))
        const completed = sales.filter((r) => r.status === 'COMPLETED')
        const voided = sales.filter((r) => r.status === 'CANCELLED')
        const pending = sales.filter((r) => r.status === 'CONFIRMED')
        const total = (rows: PosReceipt[]) => rows.reduce((s, r) => s + r.total, 0)
        return {
            completed: completed.length,
            netSales: total(completed),
            voided: voided.length,
            voidedAmount: total(voided),
            pending: pending.length,
            pendingAmount: total(pending),
        }
    }, [receipts])

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        return receipts.filter(
            (r) =>
                matchesFilter(r, filter) &&
                (!q ||
                    [r.receiptNumber, r.customerName, r.originalReceiptNumber, r.orderNumber]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(q))),
        )
    }, [receipts, filter, query])

    return (
        <Dialog
            isOpen={isOpen}
            width={1080}
            aria={{ labelledby: 'pos-transactions-title' }}
            onClose={handleClose}
            onRequestClose={handleClose}
            contentClassName="!p-0 !overflow-hidden"
        >
            <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 pb-4 pt-5 dark:border-gray-700">
                    <div className="flex items-start gap-3 pr-10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xl text-primary">
                            <HiOutlineClipboardList />
                        </span>
                        <div>
                            <h4 id="pos-transactions-title" className="heading-text">
                                Transactions
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Sales of this register. Reprint a receipt or void a sale that was completed by mistake.
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <SummaryTile
                            icon={<HiOutlineTrendingUp />}
                            label="Net sales"
                            value={formatPrice(summary.netSales)}
                            sub="Completed sales only"
                            tone="primary"
                        />
                        <SummaryTile
                            icon={<HiOutlineCheckCircle />}
                            label="Completed"
                            value={String(summary.completed)}
                            sub={`${summary.completed === 1 ? 'sale' : 'sales'}`}
                            tone="emerald"
                        />
                        <SummaryTile
                            icon={<HiOutlineBan />}
                            label="Voided"
                            value={String(summary.voided)}
                            sub={formatPrice(summary.voidedAmount)}
                            tone="red"
                        />
                        <SummaryTile
                            icon={<HiOutlineClock />}
                            label="Pending"
                            value={String(summary.pending)}
                            sub={summary.pending ? formatPrice(summary.pendingAmount) : 'Nothing to finish'}
                            tone="amber"
                        />
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Segment size="sm" value={filter} onChange={(v) => setFilter(v as Filter)}>
                            <Segment.Item value="ALL">All</Segment.Item>
                            <Segment.Item value="COMPLETED">Completed</Segment.Item>
                            <Segment.Item value="VOIDED">Voided</Segment.Item>
                            <Segment.Item value="PENDING">Pending</Segment.Item>
                        </Segment>
                        <div className="sm:w-72">
                            <Input
                                size="sm"
                                prefix={<HiOutlineSearch className="text-lg" />}
                                placeholder="Search receipt or customer"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* List */}
                <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-6 py-4 dark:bg-gray-900/40">
                    {loading && receipts.length === 0 ? (
                        <div className="flex justify-center py-12">
                            <Spinner size={28} />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-500">
                            <HiOutlineClipboardList className="h-8 w-8 text-gray-300" />
                            {receipts.length === 0 ? 'No sales yet on this register.' : 'No transactions match this view.'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <AnimatePresence initial={false}>
                                {visible.map((receipt) => (
                                    <TransactionRow
                                        key={posReceiptKey(receipt)}
                                        receipt={receipt}
                                        isNew={newKeys?.has(posReceiptKey(receipt)) ?? false}
                                        completingId={completingId}
                                        formatPrice={formatPrice}
                                        onShowReceipt={onShowReceipt}
                                        onVoid={onVoid}
                                        onComplete={onComplete}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-3 dark:border-gray-700">
                    <span className="flex items-center gap-2 text-xs text-gray-500">
                        {loading ? <Spinner size={14} /> : null}
                        Showing {visible.length} of {receipts.length} transaction{receipts.length === 1 ? '' : 's'}
                    </span>
                    <Button size="sm" onClick={handleClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

function TransactionRow({
    receipt,
    isNew,
    completingId,
    formatPrice,
    onShowReceipt,
    onVoid,
    onComplete,
}: {
    receipt: PosReceipt
    isNew: boolean
    completingId: string | null
    formatPrice: (value: number) => string
    onShowReceipt: (receipt: PosReceipt) => void
    onVoid: (receipt: PosReceipt) => void
    onComplete: (receipt: PosReceipt) => void
}) {
    const voidTransaction = isVoidRow(receipt)
    const voided = receipt.status === 'CANCELLED'
    const pending = receipt.status === 'CONFIRMED'
    const itemCount = receipt.lines.reduce((sum, line) => sum + line.quantity, 0)
    const statusLabel = voidTransaction
        ? 'Void transaction'
        : voided
          ? 'Voided'
          : pending
            ? 'Pending'
            : receipt.status === 'COMPLETED'
              ? 'Completed'
              : receipt.status
    const statusTone =
        voidTransaction || voided
            ? 'danger'
            : pending
              ? 'warning'
              : receipt.status === 'COMPLETED'
                ? 'success'
                : 'default'
    const tenders = receipt.tenders
        .map((tender) => TENDER_LABEL[tender.method] ?? tender.method)
        .join(' + ')
    const reason = voidTransaction || (voided && !receipt.voidTransactionNumber) ? receipt.voidReason : null

    return (
        <motion.div
            layout="position"
            initial={isNew ? { opacity: 0, y: -12, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className={classNames(
                'relative grid grid-cols-1 items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-shadow md:grid-cols-[minmax(0,1fr)_9rem_8.5rem_11rem] dark:bg-gray-800',
                voidTransaction
                    ? 'ml-6 border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10'
                    : voided
                      ? 'border-gray-200 opacity-80 dark:border-gray-700'
                      : 'border-gray-200 hover:shadow-sm dark:border-gray-700',
                isNew && 'ring-2 ring-emerald-400/70',
            )}
        >
            {voidTransaction ? (
                <span className="absolute -left-4 top-1/2 h-px w-4 bg-red-200 dark:bg-red-500/30" aria-hidden="true" />
            ) : null}

            {/* Receipt */}
            <div className="flex min-w-0 items-center gap-3">
                <ProductThumbnails receipt={receipt} />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold heading-text">{receipt.receiptNumber}</span>
                        <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
                        {isNew ? (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                New
                            </span>
                        ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                        {voidTransaction && receipt.originalReceiptNumber ? (
                            <span className="inline-flex items-center gap-1">
                                Reverses {receipt.originalReceiptNumber}
                                <HiOutlineArrowNarrowRight className="inline" />
                            </span>
                        ) : null}{' '}
                        {new Date(receipt.completedAt).toLocaleString('en-PH', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                        })}
                        {receipt.customerName ? ` · ${receipt.customerName}` : ''}
                    </div>
                    {reason ? <div className="mt-0.5 truncate text-xs text-red-500">Reason: {reason}</div> : null}
                </div>
            </div>

            {/* Items + payment */}
            <div className="text-xs text-gray-500 md:text-left">
                {itemCount > 0 ? (
                    <div className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </div>
                ) : null}
                {tenders ? <div className="truncate">{tenders}</div> : null}
            </div>

            {/* Amount */}
            <div
                className={classNames(
                    'text-base font-bold tabular-nums md:text-right',
                    voidTransaction ? 'text-red-600' : voided ? 'text-gray-400 line-through' : 'heading-text',
                )}
            >
                {voidTransaction ? '−' : ''}
                {formatPrice(Math.abs(receipt.total))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-start gap-2 md:justify-end">
                {voidTransaction ? null : pending ? (
                    <Button
                        size="xs"
                        variant="solid"
                        loading={completingId === receipt.salesOrderId}
                        disabled={completingId !== null}
                        onClick={() => onComplete(receipt)}
                    >
                        Complete sale
                    </Button>
                ) : (
                    <>
                        <Button size="xs" variant="default" onClick={() => onShowReceipt(receipt)}>
                            Receipt
                        </Button>
                        {voided ? null : (
                            <Button
                                size="xs"
                                variant="plain"
                                className="!text-red-500 hover:!bg-red-50 dark:hover:!bg-red-500/10"
                                onClick={() => onVoid(receipt)}
                            >
                                Void
                            </Button>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    )
}

/**
 * Count badge for the Transactions button. Each new count pops in and sends
 * out two ping rings (the ring is keyed by count, so it replays per change).
 */
export function POSTransactionsCountBadge({ count, max = 99 }: { count: number; max?: number }) {
    if (count <= 0) return null
    return (
        <span className="relative ml-1.5 inline-flex">
            <span
                key={count}
                className="absolute inset-0 rounded-full bg-primary opacity-0 animate-[ping_0.9s_cubic-bezier(0,0,0.2,1)_2]"
                aria-hidden="true"
            />
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                    key={count}
                    initial={{ scale: 0.3, opacity: 0, y: -6 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.3, opacity: 0, y: 6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums leading-none text-white shadow-sm"
                    aria-label={`${count} transactions`}
                >
                    {count > max ? `${max}+` : count}
                </motion.span>
            </AnimatePresence>
        </span>
    )
}

export default POSTransactionsDialog
