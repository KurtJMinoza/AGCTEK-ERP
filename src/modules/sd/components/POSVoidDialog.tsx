'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

type Props = {
    isOpen: boolean
    /** Receipt number of the sale that is voided. */
    receiptNumber?: string | null
    /** Amount of the sale (the cashier sees what is returned). */
    amount?: number
    saving?: boolean
    onVoid: (reason: string) => Promise<void>
    onClose: () => void
    formatPrice: (value: number) => string
}

const REASONS = [
    'Wrong item scanned',
    'Customer changed their mind',
    'Price or quantity mistake',
    'Duplicate transaction',
    'Payment problem',
]

/**
 * Void of a completed sale: the stock returns to the shelf and the tenders are
 * cancelled. A reason is required — it stays on the sale and in the audit.
 */
const POSVoidDialog = ({
    isOpen,
    receiptNumber,
    amount,
    saving = false,
    onVoid,
    onClose,
    formatPrice,
}: Props) => {
    const [reason, setReason] = useState('')
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const clean = reason.trim()
        if (!clean) {
            setError('Enter why the sale is voided.')
            return
        }
        setError(null)
        try {
            await onVoid(clean)
            setReason('')
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to void the sale.',
            )
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={460}
            aria={{ labelledby: 'pos-void-title' }}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 id="pos-void-title" className="mb-1">
                Void sale
            </h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                {receiptNumber ? `Receipt ${receiptNumber}` : 'This sale'}
                {amount ? ` · ${formatPrice(amount)}` : ''} is voided: the
                stock returns to the shelf and the payment is taken out of the
                drawer.
            </p>

            <div className="space-y-3">
                <div>
                    <label
                        htmlFor="pos-void-reason"
                        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                        Reason
                    </label>
                    <Input
                        id="pos-void-reason"
                        autoFocus
                        placeholder="Why is the sale voided?"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                void submit()
                            }
                        }}
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {REASONS.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-300"
                            onClick={() => setReason(item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                {error ? (
                    <div
                        role="alert"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    >
                        {error}
                    </div>
                ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    className="!bg-red-500 hover:!bg-red-600"
                    loading={saving}
                    onClick={() => void submit()}
                >
                    Void sale
                </Button>
            </div>
        </Dialog>
    )
}

export default POSVoidDialog
