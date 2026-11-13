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
                    const voidTransaction =
                        receipt.transactionType === 'VOID'
                    const voided = receipt.status === 'CANCELLED'
                    const pending = receipt.status === 'CONFIRMED'
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
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold">
                                        {receipt.receiptNumber}
                                    </span>
                                    <StatusBadge tone={statusTone}>
                                        {statusLabel}
                                    </StatusBadge>
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
                                                onClick={() =>
                                                    onVoid(receipt)
                                                }
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
