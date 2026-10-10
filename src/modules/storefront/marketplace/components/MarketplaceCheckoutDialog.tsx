'use client'

import { useState } from 'react'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import { HiOutlineCreditCard, HiOutlineQrcode } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import { Form, FormItem } from '@/components/ui/Form'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
import {
    CHECKOUT_PAYMENT_OPTIONS,
    type CheckoutPaymentMethod,
    type CheckoutPaymentSelection,
} from '@/modules/sd/services/salesOrderDashboardService'
import type { RetailClientProfile } from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    SellerTag,
    formatPrice,
} from '../marketplaceUi'

const FORM_ID = 'marketplace-checkout-form'

type MarketplaceCheckoutDialogProps = {
    isOpen: boolean
    client: RetailClientProfile | null
    pricing: CartPricing | null
    promoCode: string | null
    submitting: boolean
    /** Checkout engine failure surfaced inline (server error, pricing, session). */
    checkoutError: string | null
    /** Returns an error message when the code cannot be applied. */
    onApplyPromo: (code: string | null) => string | null
    onClose: () => void
    onSubmit: (
        shipping: SalesOrderShippingDetails,
        payment: CheckoutPaymentSelection,
    ) => void
    /** Opens the account page where the customer can save a delivery address. */
    onOpenAccount: () => void
}

const shippingDetails = (
    client: RetailClientProfile | null,
): SalesOrderShippingDetails =>
    client
        ? {
              fullName: client.fullName ?? '',
              email: client.email,
              phone: client.phone ?? '',
              addressLine1: client.addressLine1 ?? '',
              city: client.city ?? '',
              region: client.region ?? '',
              postalCode: client.postalCode ?? '',
              country: client.country ?? 'PH',
          }
        : {
              fullName: '',
              email: '',
              phone: '',
              addressLine1: '',
              city: '',
              region: '',
              postalCode: '',
              country: 'PH',
          }

const hasSavedAddress = (client: RetailClientProfile | null) =>
    Boolean(
        client &&
            (client.addressLine1?.trim() ||
                client.city?.trim() ||
                client.region?.trim() ||
                client.postalCode?.trim()),
    )

const MarketplaceCheckoutDialog = ({
    isOpen,
    client,
    pricing,
    promoCode,
    submitting,
    checkoutError,
    onApplyPromo,
    onClose,
    onSubmit,
    onOpenAccount,
}: MarketplaceCheckoutDialogProps) => {
    const [promoInput, setPromoInput] = useState('')
    const [promoError, setPromoError] = useState<string | null>(null)
    const [paymentMethod, setPaymentMethod] =
        useState<CheckoutPaymentMethod | null>(null)
    const [cardSimulateFailure, setCardSimulateFailure] = useState(false)
    const savedAddress = hasSavedAddress(client)

    const applyPromo = () =>
        setPromoError(onApplyPromo(promoInput.trim() || null))

    const submit = (event: { preventDefault: () => void }) => {
        // Without this the native form POST reloads the page instead of placing the order.
        event.preventDefault()
        if (!paymentMethod) return
        onSubmit(shippingDetails(client), {
            method: paymentMethod,
            cardDemoSimulateFailure:
                paymentMethod === 'CARD_DEMO' && cardSimulateFailure
                    ? true
                    : undefined,
        })
    }

    const addressBlock = client ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">
                    Deliver to
                </span>
                <Button
                    type="button"
                    size="xs"
                    variant="plain"
                    className="!px-0 !text-emerald-700 dark:!text-emerald-400"
                    onClick={onOpenAccount}
                >
                    Edit in account
                </Button>
            </div>
            {savedAddress ? (
                <div className="text-gray-600">
                    {client.fullName ? (
                        <p className="font-medium text-gray-900">
                            {client.fullName}
                        </p>
                    ) : null}
                    {client.phone ? <p>{client.phone}</p> : null}
                    <p>
                        {[client.addressLine1, client.city]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                    <p>
                        {[client.region, client.postalCode, client.country]
                            .filter(Boolean)
                            .join(', ')}
                    </p>
                </div>
            ) : (
                <Alert showIcon type="warning" className="mt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            No delivery address on your account yet — add one
                            to have it used for this order.
                        </span>
                        <Button size="xs" onClick={onOpenAccount}>
                            Add address
                        </Button>
                    </div>
                </Alert>
            )}
        </div>
    ) : null

    return (
        <FormDialog
            isOpen={isOpen}
            size="lg"
            title="Checkout"
            description={
                pricing
                    ? `Total due on delivery: ${formatPrice(pricing.grandTotal)}`
                    : ''
            }
            icon={<HiOutlineShoppingCart />}
            onClose={onClose}
            footer={
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={submitting}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        className={PRIMARY_BUTTON_CLASS}
                        customColorClass={PRIMARY_BUTTON}
                        type="submit"
                        form={FORM_ID}
                        loading={submitting}
                        disabled={!pricing || !paymentMethod}
                    >
                        Place order
                    </Button>
                </div>
            }
        >
            <Form id={FORM_ID} onSubmit={submit}>
                {checkoutError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {checkoutError}
                    </Alert>
                ) : null}
                {client ? (
                    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        Ordering as{' '}
                        <span className="font-medium text-gray-900">
                            {client.email}
                        </span>
                    </div>
                ) : null}

                {addressBlock}

                <FormItem
                    label="Promo code"
                    className="mt-4"
                    invalid={Boolean(promoError)}
                    errorMessage={promoError ?? undefined}
                >
                    <div className="flex gap-2">
                        <Input
                            value={promoInput}
                            placeholder="Optional, e.g. AWIC10"
                            onChange={(e) =>
                                setPromoInput(e.target.value.toUpperCase())
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    applyPromo()
                                }
                            }}
                        />
                        <Button type="button" onClick={applyPromo}>
                            {promoCode && promoInput.trim() === promoCode
                                ? 'Applied'
                                : 'Apply'}
                        </Button>
                    </div>
                </FormItem>

                <FormItem label="Mode of payment" className="mt-4">
                    <div
                        className="flex flex-col gap-2"
                        role="radiogroup"
                        aria-label="Mode of payment"
                    >
                        {CHECKOUT_PAYMENT_OPTIONS.map((option) => {
                            const active = paymentMethod === option.value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() =>
                                        setPaymentMethod(option.value)
                                    }
                                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                                        active
                                            ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-500/10'
                                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800'
                                    }`}
                                >
                                    <span
                                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                                            active
                                                ? 'border-emerald-500'
                                                : 'border-gray-300'
                                        }`}
                                    >
                                        {active ? (
                                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        ) : null}
                                    </span>
                                    <span className="flex flex-col gap-0.5">
                                        <span
                                            className={`font-medium ${
                                                active
                                                    ? 'text-emerald-800 dark:text-emerald-300'
                                                    : 'text-gray-900 dark:text-gray-100'
                                            }`}
                                        >
                                            {option.label}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            {option.hint}
                                        </span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {paymentMethod === 'CARD_DEMO' ? (
                        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <HiOutlineCreditCard
                                    className="text-lg"
                                    aria-hidden
                                />
                                Demo card details
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Card holder (demo only)
                                    </label>
                                    <Input
                                        placeholder="e.g. Maria Santos"
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Card number (demo only — never sent)
                                    </label>
                                    <Input
                                        placeholder="4242 4242 4242 4242"
                                        inputMode="numeric"
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        Expiry
                                    </label>
                                    <Input
                                        placeholder="MM/YY"
                                        inputMode="numeric"
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-500">
                                        CVV
                                    </label>
                                    <Input
                                        placeholder="•••"
                                        inputMode="numeric"
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                            <Checkbox
                                checked={cardSimulateFailure}
                                onChange={(checked) =>
                                    setCardSimulateFailure(checked)
                                }
                                className="mt-3"
                            >
                                Simulate a failed payment (demo)
                            </Checkbox>
                            <p className="mt-2 text-xs text-gray-400">
                                Fake fields only — no real card data is
                                collected or stored.
                            </p>
                        </div>
                    ) : null}

                    {paymentMethod === 'WALLET_DEMO' ? (
                        <Alert showIcon type="info" className="mt-3">
                            The demo wallet payment is confirmed in the review
                            step. No real wallet is charged.
                        </Alert>
                    ) : null}

                    {paymentMethod === 'QR_DEMO' ? (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                                <HiOutlineQrcode
                                    className="h-10 w-10"
                                    aria-hidden
                                />
                            </div>
                            <p className="text-xs text-gray-500">
                                Demo QR placeholder — confirm payment in the
                                review step to record it as paid.
                            </p>
                        </div>
                    ) : null}

                    {paymentMethod === 'BANK_TRANSFER_DEMO' ? (
                        <Alert showIcon type="warning" className="mt-3">
                            Your order is recorded, but warehouse processing
                            (stock reservation &amp; picking) starts only after
                            an admin verifies the bank transfer (demo).
                        </Alert>
                    ) : null}

                    <p className="mt-2 text-xs text-gray-400">
                        Demo only. No real payment will be processed.
                    </p>
                </FormItem>

                {!pricing ? (
                    <Alert showIcon type="warning" className="mt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                Your cart could not be priced. Remove and
                                re-add the items, or reload the page, then
                                place the order again.
                            </span>
                        </div>
                    </Alert>
                ) : null}

                {pricing ? (
                    <div className="mt-4 flex flex-col gap-3">
                        {pricing.divisions.map((division) => (
                            <div
                                key={division.divisionId}
                                className="rounded-xl border border-gray-100 bg-white p-4 text-sm shadow-sm"
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <SellerTag
                                        divisionId={division.divisionId}
                                    />
                                    <span className="text-xs text-gray-500">
                                        {division.lines.reduce(
                                            (n, l) => n + l.quantity,
                                            0,
                                        )}{' '}
                                        item(s)
                                    </span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>Items</span>
                                    <span>
                                        {formatPrice(division.subtotal)}
                                    </span>
                                </div>
                                {division.discountAmount > 0 ? (
                                    <div className="flex justify-between text-gray-500">
                                        <span>
                                            Discount ({division.promoCode})
                                        </span>
                                        <span>
                                            −
                                            {formatPrice(
                                                division.discountAmount,
                                            )}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="flex justify-between text-gray-500">
                                    <span>Delivery</span>
                                    <span>
                                        {formatPrice(division.shipping)}
                                    </span>
                                </div>
                                <div className="mt-1 flex justify-between font-semibold text-gray-900">
                                    <span>Store total</span>
                                    <span>
                                        {formatPrice(division.grandTotal)}
                                    </span>
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold text-gray-900">
                            <span>Total due on delivery</span>
                            <span>{formatPrice(pricing.grandTotal)}</span>
                        </div>
                    </div>
                ) : null}
            </Form>
        </FormDialog>
    )
}

export default MarketplaceCheckoutDialog
