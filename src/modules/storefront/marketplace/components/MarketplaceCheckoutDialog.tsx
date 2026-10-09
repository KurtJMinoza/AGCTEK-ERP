'use client'

import { useState } from 'react'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
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
    onSubmit: (shipping: SalesOrderShippingDetails) => void
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
    const savedAddress = hasSavedAddress(client)

    const applyPromo = () =>
        setPromoError(onApplyPromo(promoInput.trim() || null))

    const submit = () => onSubmit(shippingDetails(client))

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
                        disabled={!pricing}
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