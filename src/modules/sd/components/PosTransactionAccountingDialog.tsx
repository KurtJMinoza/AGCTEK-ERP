'use client'

import { useCallback, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import type { PosReceipt } from '../services/posService'
import { reconcilePosSaleAccounting } from '../services/posService'
import SalesOrderAccountingSection from './SalesOrderAccountingSection'

type Props = {
    receipt: PosReceipt | null
    companyId: string | null
    isOpen: boolean
    onClose: () => void
    formatPrice: (value: number) => string
    canRetryPosting?: boolean
    onCollect?: (receipt: PosReceipt) => void
}

export default function PosTransactionAccountingDialog({
    receipt,
    companyId,
    isOpen,
    onClose,
    formatPrice,
    canRetryPosting = false,
    onCollect,
}: Props) {
    const [retrying, setRetrying] = useState(false)
    const [retryMessage, setRetryMessage] = useState<string | null>(null)
    const [accountingKey, setAccountingKey] = useState(0)

    const handleRetry = useCallback(async () => {
        if (!receipt) return
        setRetrying(true)
        setRetryMessage(null)
        try {
            const result = await reconcilePosSaleAccounting(receipt.salesOrderId, false)
            setRetryMessage(result.notes.join(' · ') || `Action: ${result.action}`)
            setAccountingKey((k) => k + 1)
        } catch (err: unknown) {
            setRetryMessage(
                err instanceof Error ? err.message : 'Retry failed.',
            )
        } finally {
            setRetrying(false)
        }
    }, [receipt])

    if (!receipt) return null

    const outstanding = Number(receipt.outstandingBalance ?? 0)
    const collected = Math.max(0, receipt.total - outstanding)

    return (
        <Dialog isOpen={isOpen} onClose={onClose} width={720}>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h5 className="text-lg font-semibold heading-text">
                            Sale accounting
                        </h5>
                        <p className="mt-0.5 text-sm text-gray-500">
                            {receipt.receiptNumber} · {receipt.orderNumber ?? receipt.salesOrderId}
                        </p>
                    </div>
                    <Button size="sm" variant="plain" onClick={onClose}>
                        Close
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                        <div className="text-[10px] font-semibold uppercase text-gray-500">
                            Invoice
                        </div>
                        <div className="text-sm font-bold tabular-nums">
                            {formatPrice(receipt.total)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                        <div className="text-[10px] font-semibold uppercase text-gray-500">
                            Collected
                        </div>
                        <div className="text-sm font-bold tabular-nums text-emerald-600">
                            {formatPrice(collected)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                        <div className="text-[10px] font-semibold uppercase text-gray-500">
                            Outstanding
                        </div>
                        <div className="text-sm font-bold tabular-nums text-amber-600">
                            {formatPrice(outstanding)}
                        </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-700">
                        <div className="text-[10px] font-semibold uppercase text-gray-500">
                            Due date
                        </div>
                        <div className="text-sm font-semibold">
                            {receipt.dueDate
                                ? new Date(String(receipt.dueDate)).toLocaleDateString('en-PH')
                                : '—'}
                        </div>
                    </div>
                </div>

                <SalesOrderAccountingSection
                    key={accountingKey}
                    orderId={receipt.salesOrderId}
                    companyId={companyId}
                />

                {retryMessage ? (
                    <p className="text-xs text-gray-600 dark:text-gray-300">{retryMessage}</p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                    {canRetryPosting ? (
                        <Button
                            size="sm"
                            variant="plain"
                            loading={retrying}
                            onClick={() => void handleRetry()}
                        >
                            Retry posting
                        </Button>
                    ) : null}
                    {onCollect && outstanding > 0.005 ? (
                        <Button
                            size="sm"
                            variant="solid"
                            onClick={() => {
                                onCollect(receipt)
                                onClose()
                            }}
                        >
                            Collect payment
                        </Button>
                    ) : null}
                </div>
            </div>
        </Dialog>
    )
}
