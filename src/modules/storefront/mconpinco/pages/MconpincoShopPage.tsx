'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    HiOutlineCheckCircle,
    HiOutlineFire,
    HiOutlineLightningBolt,
    HiOutlineLocationMarker,
    HiOutlineShoppingCart,
    HiOutlineTrash,
    HiOutlineUserCircle,
    HiMinus,
    HiPlus,
} from 'react-icons/hi'
import { CreditCard, ShieldCheck, Truck, type LucideIcon } from 'lucide-react'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { Form, FormItem } from '@/components/ui/Form'
import {
    APPLIANCES_DIVISION_ID,
    toApplianceProduct,
    type ApplianceCategory,
    type ApplianceProduct,
} from '@/modules/sd/catalogs/mconpincoCatalog'
import { useDivisionProducts } from '@/modules/sd/hooks/useDivisionProducts'
import { isUnoptimizedImage } from '@/utils/productImage'
import {
    calculateCartPricing,
    processEcommerceOrder,
    type CartPricing,
    type EcommerceOrderResult,
} from '@/modules/sd/services/ecommerceService'
import { SalesOrderShippingSchema } from '@/modules/sd/types/ecommerce.schema'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import StorefrontAccountDialog from '@/modules/storefront/shared/components/StorefrontAccountDialog'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import StorefrontModeToggle from '@/modules/storefront/shared/components/StorefrontModeToggle'
import { BLANK_SHIPPING, SHIPPING_FIELDS } from '@/modules/storefront/shared/checkoutFields'
import useResponsive from '@/utils/hooks/useResponsive'
import { useMconpincoCartStore } from '../store/useMconpincoCartStore'
import ApplianceProductDetail from '../components/ApplianceProductDetail'
import {
    ADD_TO_CART_BUTTON,
    DARK_BUTTON,
    FIRE_SURFACE,
    discountPercent,
    formatPrice,
} from '../components/mconpincoUi'
import { useMconpincoClientStore } from '../store/useMconpincoClientStore'

type CategoryFilter = 'All' | ApplianceCategory

type PendingCartAction = {
    add?: { product: ApplianceProduct; quantity: number }
    checkout: boolean
}

const CATEGORY_FILTERS: CategoryFilter[] = ['All', 'Cooling', 'Laundry', 'Kitchen']

const TRUST_POINTS: { icon: LucideIcon; title: string; detail: string }[] = [
    { icon: Truck, title: 'Fast Delivery in Mindanao', detail: 'Delivered and ready to plug in' },
    { icon: ShieldCheck, title: 'Official Brand Warranty', detail: 'Genuine units, full manufacturer cover' },
    { icon: CreditCard, title: 'Secure Payment', detail: 'Pay cash on delivery, no card needed' },
]

const DANGER_BUTTON = ADD_TO_CART_BUTTON

const HERO_IMAGE =
    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1920'
const CHECKOUT_FORM_ID = 'mconpinco-checkout-form'
const STORE_NAME = 'MCONPINCO'

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const ProductImage = ({
    product,
    className,
}: {
    product: ApplianceProduct
    className?: string
}) => (
    <Image
        src={product.imageUrl}
        alt={product.name}
        width={400}
        height={400}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
        unoptimized={isUnoptimizedImage(product.imageUrl)}
        className={`bg-white object-cover dark:bg-gray-800 ${className ?? ''}`}
    />
)

/** Text wordmarks until official logo files are supplied; colour shows on hover. */
const BRANDS: { name: string; color: string; className: string }[] = [
    { name: 'SAMSUNG', color: '#1428A0', className: 'font-black tracking-[0.2em]' },
    { name: 'LG', color: '#A50034', className: 'font-black text-3xl tracking-tight' },
    { name: 'PANASONIC', color: '#0041C0', className: 'font-extrabold tracking-[0.12em]' },
    { name: 'CONDURA', color: '#E4002B', className: 'font-black italic tracking-wide' },
    { name: 'FUJIDENZO', color: '#0072BC', className: 'font-extrabold tracking-wider' },
    { name: 'CARRIER', color: '#0033A0', className: 'font-black italic tracking-tight' },
]

const BrandCarousel = () => (
    <section
        aria-label="Brands we carry"
        className="relative mt-6 overflow-hidden py-4 sm:mt-8 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
    >
        <div className="animate-marquee animation-play-state-paused flex w-max items-center [--animation-duration:28s]">
            {[...BRANDS, ...BRANDS].map((brand, index) => (
                <span
                    key={`${brand.name}-${index}`}
                    aria-hidden={index >= BRANDS.length}
                    style={{ color: brand.color }}
                    className={`mx-8 cursor-default select-none whitespace-nowrap text-2xl opacity-50 grayscale transition-all duration-300 hover:opacity-100 hover:grayscale-0 sm:mx-12 dark:invert dark:hover:invert-0 dark:hover:brightness-150 ${brand.className}`}
                >
                    {brand.name}
                </span>
            ))}
        </div>
    </section>
)

const ProductCard = ({
    product,
    quantity,
    onOpen,
    onAdd,
    onDecrease,
}: {
    product: ApplianceProduct
    quantity: number
    onOpen: () => void
    onAdd: () => void
    onDecrease: () => void
}) => (
    <Card
        clickable
        role="button"
        tabIndex={0}
        aria-label={`View details for ${product.name}`}
        bordered={false}
        bodyClass="flex h-full flex-col p-0"
        className="group h-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-900/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-gray-700/60 dark:bg-gray-800 dark:hover:shadow-black/40 dark:focus-visible:outline-gray-100"
        onClick={onOpen}
        onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                onOpen()
            }
        }}
    >
        <div className="relative overflow-hidden bg-white dark:bg-gray-800">
            <ProductImage
                product={product}
                className="aspect-square h-auto w-full transition-transform duration-500 ease-out group-hover:scale-105"
            />
            {product.badge && (
                <Tag className="absolute left-3 top-3 rounded-full border-0 bg-gray-900 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white sm:left-4 sm:top-4 sm:text-[11px]">
                    {product.badge}
                </Tag>
            )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 pb-4 sm:px-5 sm:pb-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">
                {product.category}
            </span>
            <h3 className="line-clamp-2 text-sm font-bold leading-snug tracking-tight text-gray-900 sm:text-base dark:text-gray-100">
                {product.name}
            </h3>
            <p className="line-clamp-2 hidden text-sm leading-relaxed text-gray-500 sm:block dark:text-gray-400">
                {product.description}
            </p>
            <div className="mt-auto flex flex-col gap-3 pt-3">
                <div>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-lg font-extrabold tracking-tight text-red-600 sm:text-xl dark:text-red-500">
                            {formatPrice(product.basePrice)}
                        </span>
                        {product.originalPrice && (
                            <span className="text-xs text-gray-400 line-through sm:text-sm dark:text-gray-500">
                                {formatPrice(product.originalPrice)}
                            </span>
                        )}
                    </div>
                    {product.originalPrice && (
                        <div className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                            Save {formatPrice(product.originalPrice - product.basePrice)} ·{' '}
                            {discountPercent(product)}% off
                        </div>
                    )}
                </div>
                <div
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                >
                {quantity > 0 ? (
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-1 text-gray-900 dark:border-gray-600 dark:text-gray-100">
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiMinus />}
                            aria-label={`Decrease ${product.name}`}
                            onClick={onDecrease}
                        />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{quantity} in cart</span>
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiPlus />}
                            aria-label={`Increase ${product.name}`}
                            onClick={onAdd}
                        />
                    </div>
                ) : (
                    <Button
                        block
                        size="sm"
                        variant="solid"
                        className="font-semibold"
                        customColorClass={ADD_TO_CART_BUTTON}
                        icon={<HiOutlineShoppingCart />}
                        onClick={onAdd}
                    >
                        Add to Cart
                    </Button>
                )}
                </div>
            </div>
        </div>
    </Card>
)

const MconpincoShopPage = () => {
    const items = useMconpincoCartStore((s) => s.items)
    const isDrawerOpen = useMconpincoCartStore((s) => s.isDrawerOpen)
    const openDrawer = useMconpincoCartStore((s) => s.openDrawer)
    const closeDrawer = useMconpincoCartStore((s) => s.closeDrawer)
    const addItem = useMconpincoCartStore((s) => s.addItem)
    const updateQuantity = useMconpincoCartStore((s) => s.updateQuantity)
    const removeItem = useMconpincoCartStore((s) => s.removeItem)
    const clearCart = useMconpincoCartStore((s) => s.clearCart)

    const client = useMconpincoClientStore((s) => s.client)
    const openLogin = useMconpincoClientStore((s) => s.openLogin)
    const isLoginOpen = useMconpincoClientStore((s) => s.isLoginOpen)

    const [category, setCategory] = useState<CategoryFilter>('All')
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [placedOrder, setPlacedOrder] = useState<EcommerceOrderResult | null>(null)
    const [pendingRemoval, setPendingRemoval] = useState<{ sku: string; name: string } | null>(null)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)
    const [pendingShipping, setPendingShipping] =
        useState<SalesOrderShippingDetails | null>(null)
    const [hydrated, setHydrated] = useState(false)
    const [actionAfterSignIn, setActionAfterSignIn] = useState<PendingCartAction | null>(null)
    const [selectedProduct, setSelectedProduct] = useState<ApplianceProduct | null>(null)

    useEffect(() => setHydrated(true), [])
    const signedInClient = hydrated ? client : null

    const { smaller } = useResponsive()
    const isMobile = smaller.sm

    useEffect(() => {
        if (!actionAfterSignIn) return
        if (signedInClient) {
            setActionAfterSignIn(null)
            if (actionAfterSignIn.add) {
                const { product, quantity } = actionAfterSignIn.add
                addItem(product, quantity)
                if (!actionAfterSignIn.checkout) {
                    notify('success', 'Added to cart', `${quantity} × ${product.name}`)
                }
            }
            if (actionAfterSignIn.checkout) setCheckoutOpen(true)
        } else if (!isLoginOpen) {
            setActionAfterSignIn(null)
        }
    }, [actionAfterSignIn, signedInClient, isLoginOpen, addItem])

    const catalog = useDivisionProducts(APPLIANCES_DIVISION_ID, toApplianceProduct)
    const syncCatalog = useMconpincoCartStore((s) => s.syncCatalog)

    useEffect(() => {
        if (catalog.ready) syncCatalog(catalog.products)
    }, [catalog.ready, catalog.products, syncCatalog])

    const visibleProducts = useMemo(
        () =>
            category === 'All'
                ? catalog.products
                : catalog.products.filter((product) => product.category === category),
        [category, catalog.products],
    )

    const pricing = useMemo<CartPricing | null>(() => {
        if (items.length === 0 || catalog.records.length === 0) return null
        try {
            return calculateCartPricing(
                items.map((item) => ({ sku: item.product.sku, quantity: item.quantity })),
                null,
                APPLIANCES_DIVISION_ID,
            )
        } catch {
            return null
        }
    }, [items, catalog.records])

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const quantityBySku = useMemo(
        () => new Map(items.map((item) => [item.product.sku, item.quantity])),
        [items],
    )

    const decreaseItem = (sku: string, name: string) => {
        const quantity = quantityBySku.get(sku) ?? 0
        if (quantity <= 1) setPendingRemoval({ sku, name })
        else updateQuantity(sku, quantity - 1)
    }

    const requireSignIn = (action: PendingCartAction) => {
        setActionAfterSignIn(action)
        openLogin()
    }

    const startCheckout = () => {
        if (signedInClient) setCheckoutOpen(true)
        else requireSignIn({ checkout: true })
    }

    const addFromCard = (product: ApplianceProduct) => {
        if (signedInClient) addItem(product)
        else requireSignIn({ add: { product, quantity: 1 }, checkout: false })
    }

    const addFromDetail = (product: ApplianceProduct, quantity: number) => {
        if (!signedInClient) {
            requireSignIn({ add: { product, quantity }, checkout: false })
            return
        }
        addItem(product, quantity)
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const buyNow = (product: ApplianceProduct, quantity: number) => {
        setSelectedProduct(null)
        if (!signedInClient) {
            requireSignIn({ add: { product, quantity }, checkout: true })
            return
        }
        addItem(product, quantity)
        setCheckoutOpen(true)
    }

    const productDetail = selectedProduct ? (
        <ApplianceProductDetail
            key={selectedProduct.sku}
            product={selectedProduct}
            onAddToCart={addFromDetail}
            onBuyNow={buyNow}
        />
    ) : null

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
        if (!checkoutOpen) return
        if (signedInClient) {
            const { customerId: _customerId, ...profile } = signedInClient
            reset({ ...BLANK_SHIPPING, ...profile, country: profile.country || 'PH' })
        } else {
            reset(BLANK_SHIPPING)
        }
    }, [checkoutOpen, signedInClient, reset])

    const placeOrder = async (shipping: SalesOrderShippingDetails) => {
        setPendingShipping(null)
        if (!signedInClient) {
            setCheckoutOpen(false)
            requireSignIn({ checkout: true })
            return
        }
        setSubmitting(true)
        try {
            const result = await processEcommerceOrder({
                divisionId: APPLIANCES_DIVISION_ID,
                customerId: signedInClient.customerId,
                items: items.map((item) => ({
                    sku: item.product.sku,
                    quantity: item.quantity,
                })),
                shipping,
            })
            clearCart()
            setCheckoutOpen(false)
            closeDrawer()
            setPlacedOrder(result)
        } catch (error) {
            notify(
                'danger',
                'Order not placed',
                error instanceof Error ? error.message : 'Please try again.',
            )
        } finally {
            setSubmitting(false)
        }
    }

    const cartButton = (
        <Button
            size="sm"
            variant="solid"
            customColorClass={DARK_BUTTON}
            icon={<HiOutlineShoppingCart />}
            onClick={openDrawer}
        >
            Cart
        </Button>
    )

    return (
        <div className="min-h-screen bg-[#faf9f7] transition-colors dark:bg-gray-950">
            <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${FIRE_SURFACE}`}>
                            <HiOutlineFire className="text-xl text-red-600" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <div className="text-base font-extrabold uppercase leading-tight tracking-wide text-gray-900 sm:text-lg dark:text-white">
                                {STORE_NAME}
                            </div>
                            <button
                                type="button"
                                className="flex max-w-full items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                                onClick={openLogin}
                            >
                                <HiOutlineLocationMarker className="shrink-0 text-red-600" aria-hidden />
                                <span className="truncate">
                                    {signedInClient
                                        ? `Deliver to ${signedInClient.addressLine1}, ${signedInClient.city}`
                                        : 'Sign in to set delivery address'}
                                </span>
                            </button>
                        </div>
                    </div>
                    <nav className="hidden items-center gap-6 md:flex" aria-label="Categories">
                        {CATEGORY_FILTERS.filter((filter) => filter !== 'All').map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                className={`text-sm font-semibold transition-colors hover:text-red-600 ${
                                    category === filter
                                        ? 'text-red-600 dark:text-red-500'
                                        : 'text-gray-900 dark:text-gray-200'
                                }`}
                                onClick={() => setCategory(filter)}
                            >
                                {filter}
                            </button>
                        ))}
                    </nav>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <StorefrontModeToggle className="text-gray-900 hover:text-red-600 dark:text-gray-200 dark:hover:text-red-500" />
                        <Button
                            size="sm"
                            variant="plain"
                            className="text-gray-900 hover:text-red-600 dark:text-gray-200 dark:hover:text-red-500"
                            icon={<HiOutlineUserCircle className="text-xl" />}
                            aria-label={signedInClient ? 'Your account' : 'Sign in'}
                            onClick={openLogin}
                        >
                            <span className="hidden max-w-[10rem] truncate sm:inline">
                                {signedInClient
                                    ? signedInClient.fullName.split(' ')[0]
                                    : 'Sign in'}
                            </span>
                        </Button>
                        <div className="hidden sm:block">
                            {itemCount > 0 ? (
                                <Badge content={itemCount} maxCount={99}>
                                    {cartButton}
                                </Badge>
                            ) : (
                                cartButton
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main
                className={`mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 ${itemCount > 0 ? 'pb-28 sm:pb-12' : 'pb-12'}`}
            >
                <div className="relative isolate overflow-hidden rounded-3xl bg-[#0a0a0a] px-6 py-10 text-white sm:px-12 sm:py-20">
                    <Image
                        src={HERO_IMAGE}
                        alt=""
                        fill
                        priority
                        sizes="(max-width: 1152px) 100vw, 1152px"
                        className="-z-20 object-cover"
                    />
                    <div
                        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#2f0f0f]/95 via-[#180c0c]/80 to-black/40"
                        aria-hidden
                    />
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-red-200">
                            <HiOutlineLightningBolt aria-hidden /> Hot appliance deals
                        </div>
                        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                            POWER UP <span className="text-red-600">YOUR HOME</span>
                        </h1>
                        <p className="mt-3 max-w-xl text-sm text-gray-300 sm:text-base">
                            Inverter aircons, refrigerators, washers and kitchen essentials,
                            delivered and ready to plug in.
                        </p>
                    </div>
                </div>

                <BrandCarousel />

                <section
                    aria-label="Why shop with us"
                    className="mt-4 grid grid-cols-1 gap-3 rounded-2xl bg-gray-100/80 px-5 py-4 sm:mt-6 sm:grid-cols-3 sm:gap-6 sm:px-8 sm:py-5 dark:bg-gray-900"
                >
                    {TRUST_POINTS.map(({ icon: Icon, title, detail }) => (
                        <div key={title} className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100">
                                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{detail}</div>
                            </div>
                        </div>
                    ))}
                </section>

                <div className="mb-5 mt-10 flex flex-col gap-1 sm:mb-8 sm:mt-14">
                    <h2 className="text-xl font-extrabold tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                        Shop appliances
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Limited-time prices on our most-loved models.
                    </p>
                </div>

                <Tabs
                    className="mb-6 sm:mb-8"
                    variant="pill"
                    value={category}
                    onChange={(value) => setCategory(value as CategoryFilter)}
                >
                    <Tabs.TabList className="gap-2">
                        {CATEGORY_FILTERS.map((filter) => (
                            <Tabs.TabNav
                                key={filter}
                                value={filter}
                                className={
                                    filter === category
                                        ? `!mr-0 border border-[#2f0f0f] !px-5 !py-2 !text-white ${FIRE_SURFACE}`
                                        : '!mr-0 border border-gray-200 bg-white !px-5 !py-2 !text-gray-700 hover:border-gray-400 hover:!text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:!text-gray-300 dark:hover:border-gray-500 dark:hover:!text-white'
                                }
                            >
                                {filter}
                            </Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                    {visibleProducts.map((product) => (
                        <ProductCard
                            key={product.sku}
                            product={product}
                            quantity={quantityBySku.get(product.sku) ?? 0}
                            onOpen={() => setSelectedProduct(product)}
                            onAdd={() => addFromCard(product)}
                            onDecrease={() => decreaseItem(product.sku, product.name)}
                        />
                    ))}
                </div>
                <StorefrontCatalogStatus
                    loading={catalog.loading}
                    error={catalog.error}
                    empty={catalog.ready && visibleProducts.length === 0}
                    onRetry={catalog.reload}
                />
            </main>

            {pricing ? (
                <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:hidden">
                    <button
                        type="button"
                        onClick={openDrawer}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-lg shadow-black/30 ${FIRE_SURFACE}`}
                    >
                        <span className="flex items-center gap-2">
                            <span className="relative">
                                <HiOutlineShoppingCart className="text-2xl" aria-hidden />
                                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-red-600">
                                    {itemCount}
                                </span>
                            </span>
                            <span className="ml-1 font-semibold">View cart</span>
                        </span>
                        <span className="text-base font-bold">
                            {formatPrice(pricing.grandTotal)}
                        </span>
                    </button>
                </div>
            ) : null}

            {isMobile ? (
                <Drawer
                    isOpen={selectedProduct !== null}
                    placement="bottom"
                    height="94dvh"
                    title="Product details"
                    className="[&_.drawer-content]:rounded-t-2xl"
                    onClose={() => setSelectedProduct(null)}
                    onRequestClose={() => setSelectedProduct(null)}
                >
                    {productDetail}
                </Drawer>
            ) : (
                <Dialog
                    isOpen={selectedProduct !== null}
                    width={1040}
                    onClose={() => setSelectedProduct(null)}
                    onRequestClose={() => setSelectedProduct(null)}
                >
                    <div className="pt-4">{productDetail}</div>
                </Dialog>
            )}

            <Drawer
                title="Your cart"
                isOpen={isDrawerOpen}
                placement={isMobile ? 'bottom' : 'right'}
                width={420}
                height="85dvh"
                className={isMobile ? '[&_.drawer-content]:rounded-t-2xl' : undefined}
                onClose={closeDrawer}
                onRequestClose={closeDrawer}
                footer={
                    pricing ? (
                        <div className="flex w-full flex-col gap-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Subtotal</span>
                                <span>{formatPrice(pricing.subtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Delivery</span>
                                <span>{formatPrice(pricing.shipping)}</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold dark:border-gray-700">
                                <span>Total</span>
                                <span className="text-red-600 dark:text-red-500">
                                    {formatPrice(pricing.grandTotal)}
                                </span>
                            </div>
                            <Button
                                block
                                variant="solid"
                                className="mt-2"
                                customColorClass={DARK_BUTTON}
                                onClick={startCheckout}
                            >
                                {signedInClient ? 'Checkout' : 'Sign in to checkout'}
                            </Button>
                            <Button
                                block
                                size="sm"
                                variant="plain"
                                onClick={() => setConfirmClearOpen(true)}
                            >
                                Clear cart
                            </Button>
                        </div>
                    ) : null
                }
            >
                {pricing ? (
                    <ul className="flex flex-col gap-4">
                        {pricing.lines.map((line) => {
                            const product = items.find((item) => item.product.sku === line.sku)?.product
                            return (
                                <li key={line.sku} className="flex items-start gap-3">
                                    {product ? (
                                        <ProductImage
                                            product={product}
                                            className="h-16 w-16 shrink-0 rounded-lg"
                                        />
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold heading-text">{line.name}</div>
                                        <div className="text-xs text-gray-500">
                                            {formatPrice(line.unitPrice)} each
                                        </div>
                                        <div className="mt-2 flex items-center gap-1">
                                            <Button
                                                size="xs"
                                                icon={<HiMinus />}
                                                aria-label={`Decrease ${line.name}`}
                                                onClick={() => decreaseItem(line.sku, line.name)}
                                            />
                                            <span className="w-8 text-center text-sm font-semibold">
                                                {line.quantity}
                                            </span>
                                            <Button
                                                size="xs"
                                                icon={<HiPlus />}
                                                aria-label={`Increase ${line.name}`}
                                                onClick={() => updateQuantity(line.sku, line.quantity + 1)}
                                            />
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                icon={<HiOutlineTrash />}
                                                aria-label={`Remove ${line.name}`}
                                                onClick={() =>
                                                    setPendingRemoval({ sku: line.sku, name: line.name })
                                                }
                                            />
                                        </div>
                                    </div>
                                    <span className="whitespace-nowrap font-semibold text-red-600 dark:text-red-500">
                                        {formatPrice(line.lineTotal)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-500">
                        <HiOutlineShoppingCart className="text-4xl" aria-hidden />
                        <p>Your cart is empty.</p>
                    </div>
                )}
            </Drawer>

            <FormDialog
                isOpen={checkoutOpen}
                size="lg"
                title="Delivery details"
                description={
                    pricing ? `Total due on delivery: ${formatPrice(pricing.grandTotal)}` : ''
                }
                icon={<HiOutlineShoppingCart />}
                onClose={() => setCheckoutOpen(false)}
                footer={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={submitting}
                            onClick={() => setCheckoutOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            type="submit"
                            form={CHECKOUT_FORM_ID}
                            loading={submitting}
                            disabled={!pricing}
                            customColorClass={DARK_BUTTON}
                        >
                            Place order
                        </Button>
                    </div>
                }
            >
                <Form
                    id={CHECKOUT_FORM_ID}
                    onSubmit={handleSubmit((shipping) => setPendingShipping(shipping))}
                >
                    {signedInClient ? (
                        <div className="mb-4 rounded-lg border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm dark:bg-red-500/10">
                            Ordering as{' '}
                            <span className="font-semibold">{signedInClient.email}</span>.
                            Your saved delivery details are filled in; change them
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
                </Form>
            </FormDialog>

            <Dialog
                isOpen={placedOrder !== null}
                width={420}
                onClose={() => setPlacedOrder(null)}
                onRequestClose={() => setPlacedOrder(null)}
            >
                {placedOrder ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <HiOutlineCheckCircle className="text-5xl text-red-600" aria-hidden />
                        <h4 className="heading-text">Order placed</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Order <span className="font-mono font-semibold">{placedOrder.salesOrderId}</span>{' '}
                            is pending delivery. Total due:{' '}
                            <span className="font-semibold text-red-600 dark:text-red-500">
                                {formatPrice(placedOrder.grandTotal)}
                            </span>
                        </p>
                        <Button
                            block
                            variant="solid"
                            customColorClass={DARK_BUTTON}
                            onClick={() => setPlacedOrder(null)}
                        >
                            Continue shopping
                        </Button>
                    </div>
                ) : null}
            </Dialog>

            <ConfirmDialog
                isOpen={pendingShipping !== null}
                type="warning"
                title="Place this order?"
                confirmText="Place order"
                cancelText="Review again"
                confirmButtonProps={{ customColorClass: DARK_BUTTON }}
                onClose={() => setPendingShipping(null)}
                onRequestClose={() => setPendingShipping(null)}
                onCancel={() => setPendingShipping(null)}
                onConfirm={() => {
                    if (pendingShipping) void placeOrder(pendingShipping)
                }}
            >
                {pendingShipping && pricing ? (
                    <div className="flex flex-col gap-1 text-sm">
                        <p>
                            {itemCount} item{itemCount === 1 ? '' : 's'} for delivery to{' '}
                            <span className="font-semibold">
                                {pendingShipping.addressLine1}, {pendingShipping.city}
                            </span>
                            .
                        </p>
                        <p>
                            Total due on delivery:{' '}
                            <span className="font-semibold text-red-600 dark:text-red-500">
                                {formatPrice(pricing.grandTotal)}
                            </span>
                        </p>
                    </div>
                ) : null}
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                type="danger"
                title="Remove item?"
                confirmText="Remove"
                cancelText="Keep"
                confirmButtonProps={{ customColorClass: DANGER_BUTTON }}
                onClose={() => setPendingRemoval(null)}
                onRequestClose={() => setPendingRemoval(null)}
                onCancel={() => setPendingRemoval(null)}
                onConfirm={() => {
                    if (pendingRemoval) removeItem(pendingRemoval.sku)
                    setPendingRemoval(null)
                }}
            >
                <p>Remove {pendingRemoval?.name} from your cart?</p>
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={confirmClearOpen}
                type="danger"
                title="Clear cart?"
                confirmText="Clear cart"
                cancelText="Cancel"
                confirmButtonProps={{ customColorClass: DANGER_BUTTON }}
                onClose={() => setConfirmClearOpen(false)}
                onRequestClose={() => setConfirmClearOpen(false)}
                onCancel={() => setConfirmClearOpen(false)}
                onConfirm={() => {
                    clearCart()
                    setConfirmClearOpen(false)
                }}
            >
                <p>All items will be removed from your cart.</p>
            </ConfirmDialog>

            <StorefrontAccountDialog
                useClientStore={useMconpincoClientStore}
                storeName={STORE_NAME}
                accentButtonClass={DARK_BUTTON}
                formId="mconpinco-account-form"
            />
        </div>
    )
}

export default MconpincoShopPage
