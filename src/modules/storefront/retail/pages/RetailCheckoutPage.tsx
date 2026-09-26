'use client'

import {
    useEffect,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiOutlineLockClosed, HiOutlineTrash } from 'react-icons/hi'
import ClientLoginDialog from '@/components/storefront/retail/ClientLoginDialog'
import CartDrawer from '@/components/storefront/retail/CartDrawer'
import StorefrontSiteHeader from '@/components/storefront/retail/StorefrontSiteHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import ConfirmDialog from '@/components/storefront/retail/StorefrontConfirmDialog'
import classNames from '@/utils/classNames'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'
import { useRetailCartSync } from '@/modules/storefront/retail/hooks/useRetailCartSync'
import { submitSalesOrder } from '@/services/storefront/retailService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)

type PaymentMethod = 'paymongo' | 'cod_mm' | 'cod_nationwide'
type BillingMode = 'same' | 'different'

type CheckoutForm = {
    email: string
    newsOffers: boolean
    country: string
    firstName: string
    lastName: string
    addressLine1: string
    subdivision: string
    barangay: string
    postalCode: string
    city: string
    region: string
    phone: string
    saveInfo: boolean
    payment: PaymentMethod
    billing: BillingMode
    discountCode: string
}

const fieldClass =
    'h-11 rounded-md border-brand-line bg-white font-storefront-body text-sm text-brand-ink placeholder:text-brand-ink/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold'

const labelClass =
    'mb-1.5 block font-storefront-body text-sm font-semibold text-brand-ink'

const selectClass =
    'h-11 w-full rounded-md border border-brand-line bg-white px-3 font-storefront-body text-sm text-brand-ink outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold'

const PH_REGIONS = [
    'NCR',
    'Metro Manila',
    'Misamis Oriental',
    'Cebu',
    'Davao del Sur',
    'Laguna',
    'Cavite',
    'Pampanga',
    'Other',
]

function splitName(fullName: string) {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length === 0) return { firstName: '', lastName: '' }
    if (parts.length === 1) return { firstName: parts[0], lastName: '' }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    }
}

function RadioCard({
    selected,
    onSelect,
    title,
    children,
}: {
    selected: boolean
    onSelect: () => void
    title: string
    children?: ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={classNames(
                'w-full border px-4 py-3.5 text-left transition-colors',
                selected
                    ? 'border-brand-gold bg-brand-sage/50'
                    : 'border-brand-line bg-white hover:border-brand-gold/50',
            )}
        >
            <div className="flex items-center gap-3">
                <span
                    className={classNames(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        selected
                            ? 'border-brand-gold'
                            : 'border-brand-ink/30',
                    )}
                >
                    {selected ? (
                        <span className="h-2 w-2 rounded-full bg-brand-gold" />
                    ) : null}
                </span>
                <span className="font-storefront-body text-sm font-semibold text-brand-ink">
                    {title}
                </span>
            </div>
            {selected && children ? (
                <div className="mt-3 border-t border-brand-line/80 pt-3 pl-7 font-storefront-body text-sm text-brand-ink/65">
                    {children}
                </div>
            ) : null}
        </button>
    )
}

export default function RetailCheckoutPage() {
    const router = useRouter()
    useRetailCartSync()

    const { items, clearCart, subtotal, updateQuantity, removeItem } =
        useRetailCartStore()
    const { client, openLogin } = useRetailClientStore()
    const total = subtotal()

    const [form, setForm] = useState<CheckoutForm>({
        email: '',
        newsOffers: true,
        country: 'Philippines',
        firstName: '',
        lastName: '',
        addressLine1: '',
        subdivision: '',
        barangay: '',
        postalCode: '',
        city: '',
        region: 'NCR',
        phone: '',
        saveInfo: true,
        payment: 'paymongo',
        billing: 'same',
        discountCode: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [discountApplied, setDiscountApplied] = useState(false)
    const [confirmPay, setConfirmPay] = useState(false)
    const [confirmDiscount, setConfirmDiscount] = useState(false)
    const [removeSku, setRemoveSku] = useState<string | null>(null)

    const removeTarget = items.find((item) => item.product.sku === removeSku)

    useEffect(() => {
        if (!client) return
        const { firstName, lastName } = splitName(client.fullName)
        setForm((prev) => ({
            ...prev,
            email: client.email || prev.email,
            firstName: firstName || prev.firstName,
            lastName: lastName || prev.lastName,
            phone: client.phone || prev.phone,
            addressLine1: client.addressLine1 || prev.addressLine1,
            city: client.city || prev.city,
            region: client.region || prev.region,
            postalCode: client.postalCode || prev.postalCode,
            country:
                client.country === 'PH'
                    ? 'Philippines'
                    : client.country || prev.country,
        }))
    }, [client])

    const update =
        (key: keyof CheckoutForm) =>
        (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const value =
                event.target.type === 'checkbox'
                    ? (event.target as HTMLInputElement).checked
                    : event.target.value
            setForm((prev) => ({ ...prev, [key]: value }))
        }

    const discountAmount =
        discountApplied && form.discountCode.trim().toUpperCase() === 'AWIC10'
            ? total * 0.1
            : 0
    const payable = Math.max(0, total - discountAmount)

    const handleApplyDiscount = () => {
        if (!form.discountCode.trim()) {
            setError('Enter a discount code first.')
            return
        }
        setConfirmDiscount(true)
    }

    const applyDiscountConfirmed = () => {
        setConfirmDiscount(false)
        if (form.discountCode.trim().toUpperCase() === 'AWIC10') {
            setDiscountApplied(true)
            setError(null)
        } else {
            setDiscountApplied(false)
            setError('Enter a valid discount code (try AWIC10).')
        }
    }

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        setError(null)

        if (items.length === 0) {
            setError('Your bag is empty.')
            return
        }

        const required = [
            form.email,
            form.firstName,
            form.lastName,
            form.addressLine1,
            form.city,
            form.region,
            form.postalCode,
            form.phone,
        ]
        if (required.some((v) => !String(v).trim())) {
            setError('Please complete contact and delivery details.')
            return
        }
        if (!form.email.includes('@')) {
            setError('Enter a valid email address.')
            return
        }

        setConfirmPay(true)
    }

    const placeOrderConfirmed = async () => {
        setConfirmPay(false)
        setSubmitting(true)
        setError(null)
        try {
            const result = await submitSalesOrder({
                customerId: client?.customerId ?? `GUEST-${Date.now()}`,
                divisionId: RETAIL_DIVISION_ID,
                items: items.map((item) => ({
                    sku: item.product.sku,
                    quantity: item.quantity,
                    unitPrice: item.product.basePrice,
                    lineTotal: item.itemTotal,
                })),
                shipping: {
                    fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    addressLine1: [
                        form.addressLine1.trim(),
                        form.subdivision.trim(),
                        form.barangay.trim(),
                    ]
                        .filter(Boolean)
                        .join(', '),
                    city: form.city.trim(),
                    region: form.region.trim(),
                    postalCode: form.postalCode.trim(),
                    country: form.country.trim() || 'PH',
                },
                totalAmount: Number(payable.toFixed(2)),
            })
            clearCart()
            setSuccess(result.message)
        } catch {
            setError('Unable to place order. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    if (success) {
        return (
            <div className="min-h-screen bg-brand-canvas text-brand-ink">
                <StorefrontSiteHeader />
                <CartDrawer />
                <ClientLoginDialog />
                <div className="mx-auto max-w-lg px-6 py-24 text-center">
                    <p className="font-storefront-body text-sm font-semibold uppercase tracking-[0.14em] text-brand-gold">
                        Order placed
                    </p>
                    <h1 className="mt-3 font-storefront-heading text-3xl font-semibold tracking-tight text-brand-ink">
                        Thank you
                    </h1>
                    <p className="mt-4 font-storefront-body text-base text-brand-ink/70">
                        {success}
                    </p>
                    <Button
                        className="mt-8"
                        variant="solid"
                        customColorClass={() =>
                            'rounded-none border-0 bg-brand-deep px-8 font-storefront-body text-sm font-semibold uppercase tracking-[0.08em] text-brand-gold-soft hover:bg-brand-ink'
                        }
                        onClick={() => router.push('/awic')}
                    >
                        Continue shopping
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-brand-canvas text-brand-ink">
            <StorefrontSiteHeader />
            <CartDrawer />
            <ClientLoginDialog />

            {items.length === 0 ? (
                <div className="mx-auto max-w-lg px-6 py-24 text-center">
                    <h1 className="font-storefront-heading text-2xl font-semibold tracking-tight">
                        Your bag is empty
                    </h1>
                    <p className="mt-3 font-storefront-body text-base text-brand-ink/60">
                        Add something from the shop before checking out.
                    </p>
                    <Button
                        className="mt-8"
                        variant="solid"
                        customColorClass={() =>
                            'rounded-none border-0 bg-brand-deep px-8 font-storefront-body text-sm font-semibold uppercase tracking-[0.08em] text-brand-gold-soft hover:bg-brand-ink'
                        }
                        onClick={() => router.push('/awic')}
                    >
                        Return to shop
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit}>
                    <div className="mx-auto grid max-w-[1200px] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                        {/* Left — checkout fields */}
                        <div className="space-y-10 px-6 py-10 lg:px-10 lg:py-12">
                            {/* Contact */}
                            <section>
                                <div className="mb-4 flex items-baseline justify-between gap-3">
                                    <h2 className="font-storefront-heading text-xl font-semibold tracking-tight text-brand-ink">
                                        Contact
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={openLogin}
                                        className="font-storefront-body text-sm font-semibold text-brand-gold underline-offset-2 hover:underline"
                                    >
                                        {client ? 'Account' : 'Sign in'}
                                    </button>
                                </div>
                                <label className={labelClass} htmlFor="email">
                                    Email
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={form.email}
                                    onChange={update('email')}
                                    placeholder="Email"
                                    className={fieldClass}
                                    autoComplete="email"
                                />
                                <div className="mt-3">
                                    <Checkbox
                                        checked={form.newsOffers}
                                        onChange={(checked) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                newsOffers: Boolean(checked),
                                            }))
                                        }
                                    >
                                        <span className="font-storefront-body text-sm text-brand-ink/75">
                                            Email me with news and offers
                                        </span>
                                    </Checkbox>
                                </div>
                            </section>

                            {/* Delivery */}
                            <section>
                                <h2 className="mb-4 font-storefront-heading text-xl font-semibold tracking-tight text-brand-ink">
                                    Delivery
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="country"
                                        >
                                            Country/Region
                                        </label>
                                        <select
                                            id="country"
                                            value={form.country}
                                            onChange={update('country')}
                                            className={selectClass}
                                        >
                                            <option>Philippines</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="firstName"
                                            >
                                                First name
                                            </label>
                                            <Input
                                                id="firstName"
                                                value={form.firstName}
                                                onChange={update('firstName')}
                                                className={fieldClass}
                                                autoComplete="given-name"
                                            />
                                        </div>
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="lastName"
                                            >
                                                Last name
                                            </label>
                                            <Input
                                                id="lastName"
                                                value={form.lastName}
                                                onChange={update('lastName')}
                                                className={fieldClass}
                                                autoComplete="family-name"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="address"
                                        >
                                            House/Building No. & Street Name
                                        </label>
                                        <Input
                                            id="address"
                                            value={form.addressLine1}
                                            onChange={update('addressLine1')}
                                            className={fieldClass}
                                            autoComplete="street-address"
                                        />
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="subdivision"
                                            >
                                                Subdivision / Village
                                            </label>
                                            <Input
                                                id="subdivision"
                                                value={form.subdivision}
                                                onChange={update('subdivision')}
                                                className={fieldClass}
                                            />
                                        </div>
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="barangay"
                                            >
                                                Barangay
                                            </label>
                                            <Input
                                                id="barangay"
                                                value={form.barangay}
                                                onChange={update('barangay')}
                                                className={fieldClass}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="postal"
                                            >
                                                Zip / Postal code
                                            </label>
                                            <Input
                                                id="postal"
                                                value={form.postalCode}
                                                onChange={update('postalCode')}
                                                className={fieldClass}
                                                autoComplete="postal-code"
                                            />
                                        </div>
                                        <div>
                                            <label
                                                className={labelClass}
                                                htmlFor="city"
                                            >
                                                City / Municipality
                                            </label>
                                            <Input
                                                id="city"
                                                value={form.city}
                                                onChange={update('city')}
                                                className={fieldClass}
                                                autoComplete="address-level2"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="region"
                                        >
                                            Region
                                        </label>
                                        <select
                                            id="region"
                                            value={form.region}
                                            onChange={update('region')}
                                            className={selectClass}
                                        >
                                            {PH_REGIONS.map((region) => (
                                                <option key={region} value={region}>
                                                    {region}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label
                                            className={labelClass}
                                            htmlFor="phone"
                                        >
                                            Phone
                                        </label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            value={form.phone}
                                            onChange={update('phone')}
                                            className={fieldClass}
                                            autoComplete="tel"
                                            placeholder="+63"
                                        />
                                    </div>
                                    <Checkbox
                                        checked={form.saveInfo}
                                        onChange={(checked) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                saveInfo: Boolean(checked),
                                            }))
                                        }
                                    >
                                        <span className="font-storefront-body text-sm text-brand-ink/75">
                                            Save this information for next time
                                        </span>
                                    </Checkbox>
                                </div>
                            </section>

                            {/* Shipping */}
                            <section>
                                <h2 className="mb-3 font-storefront-heading text-xl font-semibold tracking-tight text-brand-ink">
                                    Shipping
                                </h2>
                                <div className="border border-brand-gold/30 bg-brand-sage/40 px-4 py-4">
                                    <p className="font-storefront-body text-sm font-semibold text-brand-ink">
                                        Free Shipping Nationwide
                                    </p>
                                    <p className="mt-1 font-storefront-body text-sm text-brand-ink/60">
                                        {form.addressLine1.trim()
                                            ? 'Standard delivery · Free'
                                            : 'Enter your shipping address to view available shipping methods.'}
                                    </p>
                                </div>
                            </section>

                            {/* Payment */}
                            <section>
                                <h2 className="font-storefront-heading text-xl font-semibold tracking-tight text-brand-ink">
                                    Payment
                                </h2>
                                <p className="mt-1 flex items-center gap-1.5 font-storefront-body text-sm text-brand-ink/55">
                                    <HiOutlineLockClosed className="text-brand-gold" />
                                    All transactions are secure and encrypted.
                                </p>
                                <div className="mt-4 space-y-0 overflow-hidden rounded-md border border-brand-line">
                                    <RadioCard
                                        selected={form.payment === 'paymongo'}
                                        onSelect={() =>
                                            setForm((p) => ({
                                                ...p,
                                                payment: 'paymongo',
                                            }))
                                        }
                                        title="Secure Payments via PayMongo"
                                    >
                                        You’ll be redirected to Secure Payments
                                        via PayMongo to complete your purchase.
                                    </RadioCard>
                                    <RadioCard
                                        selected={form.payment === 'cod_mm'}
                                        onSelect={() =>
                                            setForm((p) => ({
                                                ...p,
                                                payment: 'cod_mm',
                                            }))
                                        }
                                        title="Cash On Delivery — Metro Manila"
                                    />
                                    <RadioCard
                                        selected={
                                            form.payment === 'cod_nationwide'
                                        }
                                        onSelect={() =>
                                            setForm((p) => ({
                                                ...p,
                                                payment: 'cod_nationwide',
                                            }))
                                        }
                                        title="Cash On Delivery — Nationwide"
                                    />
                                </div>
                            </section>

                            {/* Billing */}
                            <section>
                                <h2 className="mb-4 font-storefront-heading text-xl font-semibold tracking-tight text-brand-ink">
                                    Billing address
                                </h2>
                                <div className="overflow-hidden rounded-md border border-brand-line">
                                    <RadioCard
                                        selected={form.billing === 'same'}
                                        onSelect={() =>
                                            setForm((p) => ({
                                                ...p,
                                                billing: 'same',
                                            }))
                                        }
                                        title="Same as shipping address"
                                    />
                                    <RadioCard
                                        selected={form.billing === 'different'}
                                        onSelect={() =>
                                            setForm((p) => ({
                                                ...p,
                                                billing: 'different',
                                            }))
                                        }
                                        title="Use a different billing address"
                                    >
                                        Billing will match your delivery address
                                        for this demo order.
                                    </RadioCard>
                                </div>
                            </section>

                            {error ? (
                                <p className="font-storefront-body text-sm text-red-700">
                                    {error}
                                </p>
                            ) : null}

                            <Button
                                type="submit"
                                block
                                loading={submitting}
                                variant="solid"
                                customColorClass={() =>
                                    'h-14 rounded-md border-0 bg-brand-deep font-storefront-body text-base font-semibold text-brand-gold-soft hover:bg-brand-ink'
                                }
                            >
                                Pay now
                            </Button>

                            <p className="pb-8 text-center font-storefront-body text-xs text-brand-ink/45">
                                {AWIC_BRAND.fullName} · Secure checkout
                            </p>
                        </div>

                        {/* Right — order summary */}
                        <aside className="border-t border-brand-line bg-brand-sage/60 px-6 py-10 lg:border-l lg:border-t-0 lg:px-8 lg:py-12">
                            <div className="mb-5 flex items-baseline justify-between">
                                <h2 className="font-storefront-heading text-lg font-semibold tracking-tight text-brand-ink">
                                    Your order
                                </h2>
                                <p className="font-storefront-body text-xs text-brand-ink/45">
                                    Edit quantities anytime
                                </p>
                            </div>

                            <ul className="space-y-5">
                                {items.map((item) => (
                                    <li
                                        key={item.product.sku}
                                        className="border border-brand-line/80 bg-brand-canvas/70 p-3"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="relative h-16 w-16 shrink-0 overflow-hidden border border-brand-line bg-white">
                                                <Image
                                                    src={item.product.imageUrl}
                                                    alt={item.product.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="64px"
                                                    unoptimized={item.product.imageUrl.endsWith(
                                                        '.svg',
                                                    )}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-storefront-body text-sm font-semibold text-brand-ink">
                                                    {item.product.name}
                                                </p>
                                                <p className="mt-0.5 font-storefront-body text-xs text-brand-ink/50">
                                                    {item.product.sku}
                                                </p>
                                                <p className="mt-2 font-storefront-body text-sm font-semibold text-brand-gold">
                                                    {formatPrice(item.itemTotal)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label={`Remove ${item.product.name}`}
                                                onClick={() =>
                                                    setRemoveSku(item.product.sku)
                                                }
                                                className="p-1 text-brand-ink/30 transition-colors hover:text-brand-ink"
                                            >
                                                <HiOutlineTrash className="text-lg" />
                                            </button>
                                        </div>

                                        <div className="mt-3 flex items-center justify-between border-t border-brand-line/70 pt-3">
                                            <span className="font-storefront-body text-xs font-medium uppercase tracking-[0.12em] text-brand-ink/45">
                                                Qty
                                            </span>
                                            <div className="flex items-center border border-brand-gold/30 bg-brand-canvas">
                                                <button
                                                    type="button"
                                                    aria-label="Decrease quantity"
                                                    disabled={item.quantity <= 1}
                                                    onClick={() =>
                                                        updateQuantity(
                                                            item.product.sku,
                                                            item.quantity - 1,
                                                        )
                                                    }
                                                    className="flex h-9 w-9 items-center justify-center text-brand-ink transition-colors hover:bg-brand-sage hover:text-brand-gold disabled:opacity-35"
                                                >
                                                    −
                                                </button>
                                                <span className="min-w-10 border-x border-brand-gold/20 text-center font-storefront-body text-sm font-semibold text-brand-ink">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="Increase quantity"
                                                    onClick={() =>
                                                        updateQuantity(
                                                            item.product.sku,
                                                            item.quantity + 1,
                                                        )
                                                    }
                                                    className="flex h-9 w-9 items-center justify-center text-brand-ink transition-colors hover:bg-brand-sage hover:text-brand-gold"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-6 flex gap-2">
                                <Input
                                    value={form.discountCode}
                                    onChange={update('discountCode')}
                                    placeholder="Discount code"
                                    className={classNames(fieldClass, 'flex-1')}
                                />
                                <Button
                                    type="button"
                                    variant="solid"
                                    customColorClass={() =>
                                        'h-11 rounded-md border-0 bg-brand-deep px-5 font-storefront-body text-sm font-semibold text-brand-gold-soft hover:bg-brand-ink'
                                    }
                                    onClick={handleApplyDiscount}
                                >
                                    Apply
                                </Button>
                            </div>

                            <div className="mt-6 space-y-2 border-t border-brand-line pt-5">
                                <div className="flex justify-between font-storefront-body text-sm">
                                    <span className="text-brand-ink/65">
                                        Subtotal
                                    </span>
                                    <span className="font-semibold text-brand-ink">
                                        {formatPrice(total)}
                                    </span>
                                </div>
                                {discountApplied ? (
                                    <div className="flex justify-between font-storefront-body text-sm">
                                        <span className="text-brand-gold">
                                            Discount (AWIC10)
                                        </span>
                                        <span className="font-semibold text-brand-gold">
                                            −{formatPrice(discountAmount)}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="flex justify-between font-storefront-body text-sm">
                                    <span className="text-brand-ink/65">
                                        Shipping
                                    </span>
                                    <span className="font-semibold text-brand-ink">
                                        {form.addressLine1.trim()
                                            ? 'Free'
                                            : 'Enter shipping address'}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between border-t border-brand-line pt-4">
                                    <span className="font-storefront-body text-base font-semibold text-brand-ink">
                                        Total
                                    </span>
                                    <span className="font-storefront-body text-2xl font-semibold text-brand-gold">
                                        <span className="mr-1 text-sm font-medium text-brand-ink/45">
                                            PHP
                                        </span>
                                        {formatPrice(payable)}
                                    </span>
                                </div>
                            </div>
                        </aside>
                    </div>
                </form>
            )}

            <ConfirmDialog
                isOpen={Boolean(removeSku)}
                tone="danger"
                title="Remove item?"
                confirmText="Remove"
                cancelText="Keep"
                onCancel={() => setRemoveSku(null)}
                onConfirm={() => {
                    if (removeSku) removeItem(removeSku)
                    setRemoveSku(null)
                }}
            >
                <p>
                    Remove{' '}
                    <span className="font-semibold text-brand-ink">
                        {removeTarget?.product.name ?? 'this item'}
                    </span>{' '}
                    from this order?
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmDiscount}
                tone="default"
                title="Apply discount?"
                confirmText="Apply"
                cancelText="Cancel"
                onCancel={() => setConfirmDiscount(false)}
                onConfirm={applyDiscountConfirmed}
            >
                <p>
                    Apply code{' '}
                    <span className="font-semibold text-brand-ink">
                        {form.discountCode.trim() || '—'}
                    </span>{' '}
                    to this order?
                </p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmPay}
                tone="caution"
                title="Place this order?"
                confirmText="Pay now"
                cancelText="Cancel"
                loading={submitting}
                onCancel={() => setConfirmPay(false)}
                onConfirm={() => {
                    void placeOrderConfirmed()
                }}
            >
                <p>
                    Confirm payment of{' '}
                    <span className="font-semibold text-brand-gold">
                        {formatPrice(payable)}
                    </span>{' '}
                    via{' '}
                    {form.payment === 'paymongo'
                        ? 'PayMongo'
                        : form.payment === 'cod_mm'
                          ? 'Cash on Delivery (Metro Manila)'
                          : 'Cash on Delivery (Nationwide)'}
                    .
                </p>
            </ConfirmDialog>
        </div>
    )
}
