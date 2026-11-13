'use client'

import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import type { PosReceipt } from '../services/posService'

type Props = {
    isOpen: boolean
    loading?: boolean
    receipts: PosReceipt[]
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

const TENDER_LABEL: Record<string, string> = {
    CASH: 'Cash',
    GCASH: 'GCash',
    BANK_TRANSFER: 'Bank transfer',
    CARD: 'Card',
    CHEQUE: 'Cheque',
    SALARY_LOAN: 'Salary deduction',
}

/** Product images of the first lines of a sale (stacked, initials when no photo). */
const ProductThumbnails = ({ receipt }: { receipt: PosReceipt }) => {
    const lines = receipt.lines.slice(0, 3)
    if (!lines.length) return null
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
                            index > 0 &&
                                '-ml-3 ring-2 ring-white dark:ring-gray-900',
                        )}
                    >
                        {line.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={line.imageUrl}
                                alt={label}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-300">
                                {label.trim().slice(0, 2)}
                            </span>
                        )}
                    </div>
                )
            })}
            {receipt.lines.length > 3 ? (
                <span className="-ml-3 flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-[10px] font-semibold tabular-nums text-gray-500 ring-2 ring-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-900">
                    +{receipt.lines.length - 3}
                </span>
            ) : null}
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
    onClose,
    onShowReceipt,
    onVoid,
    onComplete,
    completingId = null,
    formatPrice,
}: Props) => (
    <Dialog
        isOpen={isOpen}
        width={720}
        aria={{ labelledby: 'pos-transactions-title' }}
        onClose={onClose}
        onRequestClose={onClose}
    >
        <h5 id="pos-transactions-title" className="mb-1">
            Transactions
        </h5>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            The sales of this register. Reprint a receipt or void a sale that
            was completed by mistake.
        </p>

        {loading ? (
            <div className="flex justify-center py-8">
                <Spinner size={28} />
            </div>
        ) : receipts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
                No sales yet.
            </p>
        ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                {receipts.map((receipt) => {
                    const voidTransaction = receipt.transactionType === 'VOID'
                    const voided = receipt.status === 'CANCELLED'
                    const pending = receipt.status === 'CONFIRMED'
                    const itemCount = receipt.lines.reduce(
                        (sum, line) => sum + line.quantity,
                        0,
                    )
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
                    return (
                        <div
                            key={`${receipt.salesOrderId}-${
                                receipt.transactionType ?? 'SALE'
                            }`}
                            className={classNames(
                                'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2',
                                voidTransaction
                                    ? 'border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10'
                                    : 'border-gray-200 dark:border-gray-700',
                            )}
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <ProductThumbnails receipt={receipt} />
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-semibold">
                                            {receipt.receiptNumber}
                                        </span>
                                        <StatusBadge tone={statusTone}>
                                            {statusLabel}
                                        </StatusBadge>
                                        {itemCount > 0 ? (
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                                                {itemCount}{' '}
                                                {itemCount === 1
                                                    ? 'item'
                                                    : 'items'}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {voidTransaction &&
                                        receipt.originalReceiptNumber
                                            ? `Reverses ${receipt.originalReceiptNumber} · `
                                            : ''}
                                        {new Date(
                                            receipt.completedAt,
                                        ).toLocaleString('en-PH')}
                                        {receipt.customerName
                                            ? ` · ${receipt.customerName}`
                                            : ''}
                                        {receipt.tenders.length
                                            ? ` · ${receipt.tenders
                                                  .map(
                                                      (tender) =>
                                                          TENDER_LABEL[
                                                              tender.method
                                                          ] ?? tender.method,
                                                  )
                                                  .join(' + ')}`
                                            : ''}
                                    </div>
                                    {voidTransaction && receipt.voidReason ? (
                                        <div className="text-xs text-red-500">
                                            {receipt.voidReason}
                                        </div>
                                    ) : null}
                                    {voided &&
                                    !receipt.voidTransactionNumber &&
                                    receipt.voidReason ? (
                                        <div className="text-xs text-red-500">
                                            {receipt.voidReason}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className={classNames(
                                        'font-semibold tabular-nums',
                                        voidTransaction && 'text-red-600',
                                    )}
                                >
                                    {formatPrice(receipt.total)}
                                </span>
                                {voidTransaction ? null : pending ? (
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        loading={
                                            completingId ===
                                            receipt.salesOrderId
                                        }
                                        disabled={completingId !== null}
                                        onClick={() => onComplete(receipt)}
                                    >
                                        Complete
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            size="xs"
                                            variant="default"
                                            onClick={() =>
                                                onShowReceipt(receipt)
                                            }
                                        >
                                            Receipt
                                        </Button>
                                        {voided ? null : (
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                className="!text-red-500"
                                                onClick={() => onVoid(receipt)}
                                            >
                                                Void
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )}

        <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={onClose}>
                Close
            </Button>
        </div>
    </Dialog>
)

export default POSTransactionsDialog
