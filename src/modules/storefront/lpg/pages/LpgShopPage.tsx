'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineFire,
    HiOutlinePlus,
    HiOutlineShoppingCart,
    HiOutlineTrash,
    HiOutlineUserCircle,
    HiOutlineLocationMarker,
    HiOutlineTruck,
} from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { Form, FormItem } from '@/components/ui/Form'
import {
    LPG_DIVISION_ID,
    isLpgAddon,
    toLpgProduct,
    type LpgProduct,
    type LpgProductCategory,
} from '@/modules/sd/catalogs/lpgCatalog'
import { useDivisionProducts } from '@/modules/sd/hooks/useDivisionProducts'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import {
    calculateCartPricing,
    processEcommerceOrder,
    type CartPricing,
    type EcommerceOrderResult,
} from '@/modules/sd/services/ecommerceService'
import { SalesOrderShippingSchema } from '@/modules/sd/types/ecommerce.schema'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import useResponsive from '@/utils/hooks/useResponsive'
import LpgAccountDialog from '../components/LpgAccountDialog'
import LpgProductDetail from '../components/LpgProductDetail'
import { BLANK_SHIPPING, SHIPPING_FIELDS } from '@/modules/storefront/shared/checkoutFields'
import StorefrontOrdersDrawer from '@/modules/storefront/shared/components/StorefrontOrdersDrawer'
import {
    ORANGE_BUTTON,
    TAG_CLASS,
    LpgProductVisual,
    QuantityStepper,
    formatPrice,
} from '../components/lpgUi'
import { useLpgCartStore } from '../store/useLpgCartStore'
import { useLpgClientStore } from '../store/useLpgClientStore'

type CategoryFilter = 'All' | Exclude<LpgProductCategory, 'Add-on'>

const CATEGORY_FILTERS: CategoryFilter[] = ['All', 'Brand-New', 'Refill']

const CHECKOUT_FORM_ID = 'lpg-checkout-form'

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const ProductCard = ({
    product,
    quantity,
    onOpen,
    onAdd,
    onDecrease,
}: {
    product: LpgProduct
    quantity: number
    onOpen: () => void
    onAdd: () => void
    onDecrease: () => void
}) => (
    <Card
        clickable
        role="button"
        tabIndex={0}
        aria-label={`View ${product.name}`}
        bodyClass="flex h-full flex-col p-0"
        className="h-full overflow-hidden transition-shadow hover:shadow-md"
        onClick={onOpen}
        onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                onOpen()
            }
        }}
    >
        <div className="relative">
            <LpgProductVisual
                product={product}
                src={product.images?.[0]}
                className="aspect-square w-full"
            />
            <Tag
                className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:left-3 sm:top-3 sm:px-3 sm:py-1 sm:text-xs ${TAG_CLASS[product.category]}`}
            >
                {product.category}
            </Tag>
            <div
                className="absolute bottom-2 right-2"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                {quantity > 0 ? (
                    <div className="rounded-full bg-white p-1 shadow-md dark:bg-gray-800">
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            onDecrease={onDecrease}
                            onIncrease={onAdd}
                        />
                    </div>
                ) : (
                    <Button
                        size="sm"
                        shape="circle"
                        variant="solid"
                        className="!h-9 !w-9 shadow-md"
                        customColorClass={ORANGE_BUTTON}
                        icon={<HiOutlinePlus className="text-lg" />}
                        aria-label={`Add ${product.name} to cart`}
                        onClick={onAdd}
                    />
                )}
            </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 sm:p-4">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug heading-text sm:text-base">
                {product.name}
            </h3>
            <p className="line-clamp-2 hidden flex-1 text-sm text-gray-500 sm:block dark:text-gray-400">
                {product.description}
            </p>
            <div className="mt-auto pt-1 text-base font-bold text-orange-500 sm:text-lg">
                {formatPrice(product.basePrice)}
            </div>
        </div>
    </Card>
)

const LpgShopPage = () => {
    const items = useLpgCartStore((s) => s.items)
    const isDrawerOpen = useLpgCartStore((s) => s.isDrawerOpen)
    const openDrawer = useLpgCartStore((s) => s.openDrawer)
    const closeDrawer = useLpgCartStore((s) => s.closeDrawer)
    const addItem = useLpgCartStore((s) => s.addItem)
    const updateQuantity = useLpgCartStore((s) => s.updateQuantity)
    const removeItem = useLpgCartStore((s) => s.removeItem)
    const clearCart = useLpgCartStore((s) => s.clearCart)

    const client = useLpgClientStore((s) => s.client)
    const openLogin = useLpgClientStore((s) => s.openLogin)
    const isLoginOpen = useLpgClientStore((s) => s.isLoginOpen)

    const [category, setCategory] = useState<CategoryFilter>('All')
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [placedOrder, setPlacedOrder] = useState<EcommerceOrderResult | null>(null)
    const [pendingRemoval, setPendingRemoval] = useState<{ sku: string; name: string } | null>(null)
    const [confirmClearOpen, setConfirmClearOpen] = useState(false)
    const [pendingShipping, setPendingShipping] =
        useState<SalesOrderShippingDetails | null>(null)
    const [hydrated, setHydrated] = useState(false)
    const [checkoutAfterSignIn, setCheckoutAfterSignIn] = useState(false)
    const [ordersAfterSignIn, setOrdersAfterSignIn] = useState(false)
    const [ordersOpen, setOrdersOpen] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<LpgProduct | null>(null)

    useEffect(() => setHydrated(true), [])
    const signedInClient = hydrated ? client : null

    useEffect(() => {
        if (!checkoutAfterSignIn) return
        if (signedInClient) {
            setCheckoutAfterSignIn(false)
            setCheckoutOpen(true)
        } else if (!isLoginOpen) {
            setCheckoutAfterSignIn(false)
        }
    }, [checkoutAfterSignIn, signedInClient, isLoginOpen])

    useEffect(() => {
        if (!ordersAfterSignIn) return
        if (signedInClient) {
            setOrdersAfterSignIn(false)
            setOrdersOpen(true)
        } else if (!isLoginOpen) {
            setOrdersAfterSignIn(false)
        }
    }, [ordersAfterSignIn, signedInClient, isLoginOpen])

    useEffect(() => {
        if (!signedInClient) setOrdersOpen(false)
    }, [signedInClient])

    const openOrders = () => {
        if (signedInClient) {
            setOrdersOpen(true)
            return
        }
        setOrdersAfterSignIn(true)
        openLogin()
    }

    const startCheckout = () => {
        if (!items.some((item) => !isLpgAddon(item.product))) {
            notify(
                'danger',
                'Add a regular product',
                'Add-ons cannot be ordered alone. Add at least one LPG refill or set to your cart.',
            )
            return
        }
        if (signedInClient) {
            setCheckoutOpen(true)
            return
        }
        setCheckoutAfterSignIn(true)
        openLogin()
    }

    const catalog = useDivisionProducts(LPG_DIVISION_ID, toLpgProduct)
    const syncCatalog = useLpgCartStore((s) => s.syncCatalog)

    useEffect(() => {
        if (catalog.ready) syncCatalog(catalog.products)
    }, [catalog.ready, catalog.products, syncCatalog])

    const { mainProducts, addons } = useMemo(
        () => ({
            mainProducts: catalog.products.filter((product) => !isLpgAddon(product)),
            addons: catalog.products.filter(isLpgAddon),
        }),
        [catalog.products],
    )

    const visibleProducts = useMemo(
        () =>
            category === 'All'
                ? mainProducts
                : mainProducts.filter((product) => product.category === category),
        [category, mainProducts],
    )

    const pricing = useMemo<CartPricing | null>(() => {
        if (items.length === 0 || catalog.records.length === 0) return null
        try {
            return calculateCartPricing(
                items.map((item) => ({ sku: item.product.sku, quantity: item.quantity })),
                null,
                LPG_DIVISION_ID,
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
    const { smaller } = useResponsive()
    const isMobile = smaller.sm

    const decreaseItem = (sku: string, name: string) => {
        const quantity = quantityBySku.get(sku) ?? 0
        if (quantity <= 1) setPendingRemoval({ sku, name })
        else updateQuantity(sku, quantity - 1)
    }

    const cartHasRegularItem = items.some((item) => !isLpgAddon(item.product))

    const addFromDetail = (product: LpgProduct, quantity: number) => {
        addItem(product, quantity)
        notify('success', 'Added to cart', `${quantity} × ${product.name}`)
    }

    const buyNow = (product: LpgProduct, quantity: number) => {
        addItem(product, quantity)
        setSelectedProduct(null)
        openDrawer()
    }

    const productDetail = selectedProduct ? (
        <LpgProductDetail
            key={selectedProduct.sku}
            product={selectedProduct}
            addons={addons}
            cartHasRegularItem={cartHasRegularItem}
            onAddToCart={addFromDetail}
            onBuyNow={buyNow}
        />
    ) : null

    const cartButton = (
        <Button
            size="sm"
            variant="default"
            icon={<HiOutlineShoppingCart />}
            onClick={openDrawer}
        >
            Cart
        </Button>
    )

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
            setCheckoutAfterSignIn(true)
            openLogin()
            return
        }
        setSubmitting(true)
        try {
            const result = await processEcommerceOrder({
                divisionId: LPG_DIVISION_ID,
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

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pb-2 pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
                            <HiOutlineFire className="text-xl" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <div className="text-base font-bold leading-tight heading-text sm:text-lg">
                                LPG Store
                            </div>
                            <button
                                type="button"
                                className="flex max-w-full items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                                onClick={openLogin}
                            >
                                <HiOutlineLocationMarker className="shrink-0 text-orange-500" aria-hidden />
                                <span className="truncate">
                                    {signedInClient
                                        ? `Deliver to ${signedInClient.addressLine1}, ${signedInClient.city}`
                                        : 'Sign in to set delivery address'}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineClipboardList className="text-xl" />}
                            aria-label="My orders"
                            onClick={openOrders}
                        >
                            <span className="hidden sm:inline">Orders</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
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
                <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
                    <Segment
                        size="sm"
                        value={category}
                        onChange={(value) => setCategory(value as CategoryFilter)}
                    >
                        {CATEGORY_FILTERS.map((filter) => (
                            <Segment.Item key={filter} value={filter}>
                                <span className="whitespace-nowrap px-1">{filter}</span>
                            </Segment.Item>
                        ))}
                    </Segment>
                </div>
            </header>

            <main
                className={`mx-auto max-w-6xl px-4 py-4 sm:py-8 ${itemCount > 0 ? 'pb-28 sm:pb-8' : ''}`}
            >
                <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 p-4 text-white sm:mb-6 sm:p-6">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-90">
                        <HiOutlineTruck aria-hidden /> Home delivery
                    </div>
                    <h1 className="mt-1 text-xl font-bold text-white sm:text-3xl">
                        LPG Refills &amp; Sets
                    </h1>
                    <p className="mt-1 text-sm text-white/90">
                        Order in a few taps. Pay cash on delivery.
                    </p>
                </div>

                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 sm:hidden">
                    {category === 'All' ? 'All products' : category} · {visibleProducts.length}
                </h2>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                    {visibleProducts.map((product) => (
                        <ProductCard
                            key={product.sku}
                            product={product}
                            quantity={quantityBySku.get(product.sku) ?? 0}
                            onOpen={() => setSelectedProduct(product)}
                            onAdd={() => addItem(product)}
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
                        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-lg shadow-orange-500/30 active:bg-orange-600"
                    >
                        <span className="flex items-center gap-2">
                            <span className="relative">
                                <HiOutlineShoppingCart className="text-2xl" aria-hidden />
                                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-orange-600">
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
                    bodyClass="pb-0"
                    onClose={() => setSelectedProduct(null)}
                    onRequestClose={() => setSelectedProduct(null)}
                >
                    {productDetail}
                </Drawer>
            ) : (
                <Dialog
                    isOpen={selectedProduct !== null}
                    width={960}
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
                width={400}
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
                                <span className="text-orange-500">
                                    {formatPrice(pricing.grandTotal)}
                                </span>
                            </div>
                            <Button
                                block
                                variant="solid"
                                className="mt-2"
                                customColorClass={ORANGE_BUTTON}
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
                        {pricing.lines.map((line) => (
                            <li key={line.sku} className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-semibold heading-text">{line.name}</div>
                                    <div className="text-xs text-gray-500">
                                        {formatPrice(line.unitPrice)} each
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <QuantityStepper
                                            quantity={line.quantity}
                                            label={line.name}
                                            onDecrease={() => decreaseItem(line.sku, line.name)}
                                            onIncrease={() => updateQuantity(line.sku, line.quantity + 1)}
                                        />
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            icon={<HiOutlineTrash />}
                                            aria-label={`Remove ${line.name}`}
                                            onClick={() =>
                                                setPendingRemoval({ sku: line.sku, name: line.name })
                                            }
                                        />
                                    </div>
                                </div>
                                <span className="whitespace-nowrap font-semibold text-orange-500">
                                    {formatPrice(line.lineTotal)}
                                </span>
                            </li>
                        ))}
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
                            customColorClass={ORANGE_BUTTON}
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
                        <div className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm dark:bg-orange-500/10">
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
                        <HiOutlineCheckCircle className="text-5xl text-orange-500" aria-hidden />
                        <h4 className="heading-text">Order placed</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Order <span className="font-mono font-semibold">{placedOrder.salesOrderId}</span>{' '}
                            is pending delivery. Total due:{' '}
                            <span className="font-semibold text-orange-500">
                                {formatPrice(placedOrder.grandTotal)}
                            </span>
                        </p>
                        <Button
                            block
                            variant="solid"
                            customColorClass={ORANGE_BUTTON}
                            onClick={() => setPlacedOrder(null)}
                        >
                            Continue shopping
                        </Button>
                        <Button
                            block
                            variant="plain"
                            onClick={() => {
                                setPlacedOrder(null)
                                setOrdersOpen(true)
                            }}
                        >
                            View my orders
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
                confirmButtonProps={{ customColorClass: ORANGE_BUTTON }}
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
                            <span className="font-semibold text-orange-500">
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
                confirmButtonProps={{
                    customColorClass: () => 'bg-red-500 hover:bg-red-600 text-white',
                }}
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
                confirmButtonProps={{
                    customColorClass: () => 'bg-red-500 hover:bg-red-600 text-white',
                }}
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

            <StorefrontOrdersDrawer
                isOpen={ordersOpen}
                customerId={signedInClient?.customerId ?? null}
                divisionId={LPG_DIVISION_ID}
                isMobile={isMobile}
                accentTextClass="text-orange-500"
                onClose={() => setOrdersOpen(false)}
            />

            <LpgAccountDialog />
        </div>
    )
}

export default LpgShopPage
