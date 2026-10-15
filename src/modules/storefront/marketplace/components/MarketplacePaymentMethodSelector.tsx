'use client'

import {
    Banknote,
    CreditCard,
    Landmark,
    QrCode,
    Wallet,
} from 'lucide-react'
import Checkbox from '@/components/ui/Checkbox'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import {
    PAYMENT_METHOD_LABEL,
    type CheckoutPaymentMethod,
} from '@/modules/sd/services/salesOrderDashboardService'

type PaymentOption = {
    value: CheckoutPaymentMethod
    hint: string
    isDemo: boolean
    Icon: typeof Banknote
}

const PAYMENT_OPTIONS: readonly PaymentOption[] = [
    {
        value: 'COD',
        hint: 'Pay the courier when the order arrives.',
        isDemo: false,
        Icon: Banknote,
    },
    {
        value: 'CARD_DEMO',
        hint: 'Simulated approval only. No card details are requested.',
        isDemo: true,
        Icon: CreditCard,
    },
    {
        value: 'WALLET_DEMO',
        hint: 'A demo wallet confirmation is recorded at checkout.',
        isDemo: true,
        Icon: Wallet,
    },
    {
        value: 'QR_DEMO',
        hint: 'Use the demo QR placeholder to confirm the sample flow.',
        isDemo: true,
        Icon: QrCode,
    },
    {
        value: 'BANK_TRANSFER_DEMO',
        hint: 'An administrator must verify it before warehouse processing.',
        isDemo: true,
        Icon: Landmark,
    },
]

type MarketplacePaymentMethodSelectorProps = {
    value: CheckoutPaymentMethod | null
    onChange: (value: CheckoutPaymentMethod) => void
    cardDemoSimulateFailure: boolean
    onCardDemoSimulateFailureChange: (value: boolean) => void
}

/**
 * Checkout-only presentation for the existing SD demo-payment contract.
 * It never handles gateway credentials or card information.
 */
const MarketplacePaymentMethodSelector = ({
    value,
    onChange,
    cardDemoSimulateFailure,
    onCardDemoSimulateFailureChange,
}: MarketplacePaymentMethodSelectorProps) => {
    const selectPaymentMethod = (method: CheckoutPaymentMethod) => {
        onChange(method)
        if (method !== 'CARD_DEMO') {
            onCardDemoSimulateFailureChange(false)
        }
    }

    return (
        <div>
            <div
                className="flex flex-col gap-2"
                role="radiogroup"
                aria-label="Payment method"
            >
                {PAYMENT_OPTIONS.map((option) => {
                    const active = value === option.value
                    const Icon = option.Icon
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => selectPaymentMethod(option.value)}
                            className={classNames(
                                'flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                                active
                                    ? 'border-shop-500 bg-shop-50 dark:border-shop-400 dark:bg-shop-500/10'
                                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800',
                            )}
                        >
                            <span
                                className={classNames(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                    active
                                        ? 'bg-shop-100 text-shop-700 dark:bg-shop-500/20 dark:text-shop-300'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
                                )}
                                aria-hidden
                            >
                                <Icon size={18} strokeWidth={2} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={classNames(
                                            'font-medium',
                                            active
                                                ? 'text-shop-800 dark:text-shop-300'
                                                : 'text-gray-900 dark:text-gray-100',
                                        )}
                                    >
                                        {PAYMENT_METHOD_LABEL[option.value]}
                                    </span>
                                    {option.isDemo ? (
                                        <Tag className="!border-amber-100 !bg-amber-50 !px-1.5 !py-0.5 !text-[10px] !font-semibold !uppercase !tracking-wide !text-amber-700 dark:!border-amber-500/20 dark:!bg-amber-500/10 dark:!text-amber-300">
                                            Demo only
                                        </Tag>
                                    ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                                    {option.hint}
                                </span>
                            </span>
                            <span
                                className={classNames(
                                    'mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                                    active
                                        ? 'border-shop-500'
                                        : 'border-gray-300 dark:border-gray-500',
                                )}
                                aria-hidden
                            >
                                {active ? (
                                    <span className="h-2 w-2 rounded-full bg-shop-500" />
                                ) : null}
                            </span>
                        </button>
                    )
                })}
            </div>

            {value === 'CARD_DEMO' ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <CreditCard size={18} aria-hidden />
                        Demo card simulation
                    </div>
                    <Checkbox
                        checked={cardDemoSimulateFailure}
                        onChange={onCardDemoSimulateFailureChange}
                        className="mt-3"
                    >
                        Simulate a failed payment
                    </Checkbox>
                    <p className="mt-2 text-xs leading-5 text-gray-500">
                        No real card details are requested, processed, or
                        stored.
                    </p>
                </div>
            ) : null}

            {value === 'WALLET_DEMO' ? (
                <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
                    The demo wallet is confirmed immediately. No wallet is
                    charged.
                </p>
            ) : null}

            {value === 'QR_DEMO' ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/70">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-900">
                        <QrCode size={40} aria-hidden />
                    </div>
                    <p className="text-xs leading-5 text-gray-500">
                        Demo QR placeholder. The demo flow records this payment
                        as paid; no scan or real transfer occurs.
                    </p>
                </div>
            ) : null}

            {value === 'BANK_TRANSFER_DEMO' ? (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    Your order remains pending verification. Reservation and
                    picking start only after an administrator marks it paid.
                </p>
            ) : null}

            <p className="mt-3 text-xs text-gray-500">
                Demo only. No real payment will be processed.
            </p>
        </div>
    )
}

export default MarketplacePaymentMethodSelector
