'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import type { CartPricing } from '@/modules/sd/services/ecommerceService'
import { SalesOrderShippingSchema } from '@/modules/sd/types/ecommerce.schema'
import type { RetailClientProfile } from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import {
    BLANK_SHIPPING,
    SHIPPING_FIELDS,
} from '@/modules/storefront/shared/checkoutFields'
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
    /** Returns an error message when the code cannot be applied. */
    onApplyPromo: (code: string | null) => string | null
    onClose: () => void
    onSubmit: (shipping: SalesOrderShippingDetails) => void
}

const MarketplaceCheckoutDialog = ({
    isOpen,
    client,
    pricing,
    promoCode,
    submitting,
    onApplyPromo,
    onClose,
    onSubmit,
}: MarketplaceCheckoutDialogProps) => {
    const [promoInput, setPromoInput] = useState('')
    const [promoError, setPromoError] = useState<string | null>(null)
    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<SalesOrderShippingDetails>({
        defaultValues: BLANK_SHIPPING,
        resolver: zodResolver(SalesOrderShippingSchema),
    })

    useEffect(() => {
        if (!isOpen) return
        setPromoInput(promoCode ?? '')
        setPromoError(null)
        if (client) {
            const { customerId: _customerId, ...profile } = client
            reset({
                ...BLANK_SHIPPING,
                ...profile,
                country: profile.country || 'PH',
            })
        } else {
            reset(BLANK_SHIPPING)
        }
        // Only refill when the dialog opens or the account changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, client, reset])

    const applyPromo = () =>
        setPromoError(onApplyPromo(promoInput.trim() || null))

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
            <Form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
                {client ? (
                    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        Ordering as{' '}
                        <span className="font-medium text-gray-900">
                            {client.email}
                        </span>
                        . Your saved delivery details are filled in; change them
                        here for this order only.
                    </div>
                ) : null}
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    {SHIPPING_FIELDS.map((field) => (
                        <FormItem
                            key={field.name}
                            className={field.wide ? 'sm:col-span-2' : undefined}
                            label={field.label}
                            asterisk
                            invalid={Boolean(errors[field.name])}
                            errorMessage={errors[field.name]?.message}
                        >
                            <Controller
                                name={field.name}
                                control={control}
                                render={({ field: input }) => (
                                    <Input
                                        type={field.type ?? 'text'}
                                        placeholder={field.placeholder}
                                        disabled={field.name === 'email'}
                                        {...input}
                                    />
                                )}
                            />
                        </FormItem>
                    ))}
                </div>

                <FormItem
                    label="Promo code"
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

                {pricing ? (
                    <div className="flex flex-col gap-3">
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
