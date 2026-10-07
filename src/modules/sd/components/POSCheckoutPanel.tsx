'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'

type POSCheckoutPanelProps = {
    itemCount: number
    lineCount: number
    subtotal: number
    cash: string
    onCashChange: (value: string) => void
    change: number
    checkingOut: boolean
    canCheckout: boolean
    onCheckout: () => void
    onVoid: () => void
    formatPrice: (value: number) => string
}

const POSCheckoutPanel = ({
    itemCount,
    lineCount,
    subtotal,
    cash,
    onCashChange,
    change,
    checkingOut,
    canCheckout,
    onCheckout,
    onVoid,
    formatPrice,
}: POSCheckoutPanelProps) => (
    <AdaptiveCard className="border border-gray-200 shadow-sm dark:border-gray-700 lg:sticky lg:top-4">
        <div className="mb-4 flex items-start justify-between gap-2">
            <div>
                <h3 className="text-lg font-bold heading-text">Checkout</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Cash sale · immediate stock deduction
                </p>
            </div>
            <Tag className="shrink-0 font-semibold tabular-nums">
                {itemCount} item{itemCount === 1 ? '' : 's'}
            </Tag>
        </div>

        <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
                <div className="flex justify-between text-sm text-gray-500">
                    <span>Line items</span>
                    <span className="font-medium tabular-nums text-gray-700 dark:text-gray-200">
                        {lineCount}
                    </span>
                </div>
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-3 dark:border-gray-600">
                    <span className="text-base font-semibold heading-text">Total</span>
                    <span className="text-xl font-bold tabular-nums heading-text">
                        {formatPrice(subtotal)}
                    </span>
                </div>
            </div>

            <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Cash received
                </label>
                <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    className="h-12 text-lg font-semibold tabular-nums"
                    placeholder="0.00"
                    value={cash}
                    onChange={(e) => onCashChange(e.target.value)}
                />
            </div>

            <div className="flex justify-between rounded-lg px-1 text-sm">
                <span className="text-gray-500">Change</span>
                <span
                    className={classNames(
                        'font-bold tabular-nums',
                        change > 0 ? 'text-emerald-600' : 'heading-text',
                    )}
                >
                    {formatPrice(change)}
                </span>
            </div>

            <div className="flex flex-col gap-2 pt-1">
                <Button
                    block
                    size="lg"
                    variant="solid"
                    className="h-12"
                    loading={checkingOut}
                    disabled={!canCheckout}
                    onClick={onCheckout}
                >
                    Tender cash &amp; checkout
                </Button>
                <Button
                    block
                    size="lg"
                    variant="solid"
                    className="h-12"
                    customColorClass={() =>
                        'bg-red-500 hover:bg-red-600 text-white border-red-500'
                    }
                    disabled={lineCount === 0 || checkingOut}
                    onClick={onVoid}
                >
                    Void transaction
                </Button>
            </div>
        </div>
    </AdaptiveCard>
)

export default POSCheckoutPanel
