'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
    HiOutlineCamera,
    HiOutlineExclamation,
    HiOutlineLogout,
    HiOutlineMinus,
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlinePrinter,
    HiOutlineQrcode,
    HiOutlineSearch,
    HiOutlineShoppingCart,
    HiOutlineSwitchHorizontal,
    HiOutlineTrash,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { toRetailProduct } from '@/services/storefront/retailService'
import {
    RETAIL_DIVISION_ID,
    type RetailProduct,
} from '@/types/storefront/retail'
import { useDivisionProducts } from '../hooks/useDivisionProducts'
import { usePOSCatalogSearch } from '../hooks/usePOSCatalogSearch'
import { usePOSLiveStock } from '../hooks/usePOSLiveStock'
import {
    usePOSCartStore,
    posLineKey,
    type POSCartItem,
    type POSVariant,
} from '../store/usePOSCartStore'
import {
    productOptionVariantsService,
    type ProductVariantDefinition,
} from '../services/productOptionVariantsService'
import { fetchStorefrontAvailabilityBatch } from '../services/productCatalogService'
import { lookupProductBarcode } from '../services/productBarcodeService'
import {
    processPOSCheckout,
    type POSCheckoutResult,
} from '../services/posService'
import POSReceipt from '../components/POSReceipt'
import POSCheckoutPanel from '../components/POSCheckoutPanel'
import BarcodeQuickAddDialog from '../components/BarcodeQuickAddDialog'
import { PcProductThumbnail } from '../components/ProductCatalogTableCells'
import {
    POS_GATEWAY_PATH,
    useActivePOSBranch,
} from '../store/usePOSBranchStore'
import useResourceAccess from '@/utils/hooks/useResourceAccess'

const CameraBarcodeScanner = dynamic(
    () => import('@/modules/mm/barcode-rfid/components/CameraBarcodeScanner'),
    { ssr: false },
)

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
    }).format(value)

const notify = (
    type: 'success' | 'danger' | 'info',
    title: string,
    message: string,
) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const POSDashboard = () => {
    const router = useRouter()
    const { hydrated, branch } = useActivePOSBranch()
    const branchId = branch?.id ?? null
    const { canCreate } = useResourceAccess('sd.pos')

    useEffect(() => {
        if (hydrated && !branchId) router.replace(POS_GATEWAY_PATH)
    }, [hydrated, branchId, router])

    const items = usePOSCartStore((s) => s.items)
    const subtotal = usePOSCartStore((s) => s.getCartTotal())
    const addItem = usePOSCartStore((s) => s.addItem)
    const updateQuantity = usePOSCartStore((s) => s.updateQuantity)
    const removeItem = usePOSCartStore((s) => s.removeItem)
    const clearCart = usePOSCartStore((s) => s.clearCart)
    const catalog = useDivisionProducts(RETAIL_DIVISION_ID, toRetailProduct)
    /** Parent with multiple variants → cashier picks the exact one. */
    const [variantPicker, setVariantPicker] = useState<{
        product: ReturnType<typeof toRetailProduct>
        variants: ProductVariantDefinition[]
    } | null>(null)

    const skuInputRef = useRef<HTMLInputElement>(null)
    const [sku, setSku] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [cash, setCash] = useState('')
    const [checkingOut, setCheckingOut] = useState(false)
    const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
    const [receipt, setReceipt] = useState<POSCheckoutResult | null>(null)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [addingSku, setAddingSku] = useState(false)
    const [registerBarcode, setRegisterBarcode] = useState<string | null>(null)

    /** Live search over the loaded catalog plus the central barcode registry. */
    const search = usePOSCatalogSearch(catalog.products, sku)
    const searchRows =
        search.products.length + (search.barcode !== null ? 1 : 0)
    const showSearch =
        searchFocused && sku.trim().length > 0 && catalog.ready

    const itemCount = useMemo(
        () => items.reduce((sum, row) => sum + row.quantity, 0),
        [items],
    )

    /** Live MM stock for every cart line; re-read whenever the cart changes. */
    const stockLines = useMemo(
        () =>
            items.map((item) => ({
                sku: item.product.sku,
                variantId: item.variant?.id ?? null,
            })),
        [items],
    )
    const { availabilityFor, refresh: refreshStock } = usePOSLiveStock(
        RETAIL_DIVISION_ID,
        stockLines,
    )

    /** Sellable quantity of one line, or null when the stock is not known yet. */
    const availableFor = useCallback(
        (item: Pick<POSCartItem, 'product' | 'variant'>) => {
            const stock = availabilityFor(
                item.product.sku,
                item.variant?.id ?? null,
            )
            if (!stock) return null
            if (stock.state === 'NON_INVENTORY') return Number.POSITIVE_INFINITY
            return Math.max(0, stock.availableQuantity)
        },
        [availabilityFor],
    )

    /** Quantity already in the cart for one product/variant. */
    const cartQuantityFor = useCallback(
        (sku: string, variantId?: string | null) =>
            items
                .filter(
                    (item) =>
                        posLineKey(item) ===
                        (variantId ? `${sku}#${variantId}` : sku),
                )
                .reduce((sum, item) => sum + item.quantity, 0),
        [items],
    )

    /** Lines the cart holds more of than the live stock allows. */
    const shortLines = useMemo(
        () =>
            items.filter((item) => {
                const available = availableFor(item)
                return available !== null && item.quantity > available
            }),
        [items, availableFor],
    )

    /**
     * Live sellable quantity for one product, read on demand so the check runs
     * against the current MM ledger and not a cached cart snapshot.
     */
    const fetchAvailable = useCallback(
        async (sku: string, variantId?: string | null) => {
            try {
                const rows = await fetchStorefrontAvailabilityBatch(
                    RETAIL_DIVISION_ID,
                    [{ sku, variantId: variantId ?? null }],
                )
                const row = rows[0]
                if (!row) return null
                if (row.state === 'NON_INVENTORY')
                    return Number.POSITIVE_INFINITY
                return Math.max(0, row.availableQuantity)
            } catch {
                // Stock unknown (offline / API down). The checkout ATP gate is
                // the authority — the terminal must still be able to take a sale.
                return null
            }
        },
        [],
    )

    /**
     * Adds a line to the cart after checking it against the live stock. The
     * server re-checks at checkout, so this is the cashier-facing guard.
     */
    const addToCart = useCallback(
        async (product: RetailProduct, variant?: POSVariant) => {
            const variantId = variant?.id ?? null
            const available = await fetchAvailable(product.sku, variantId)
            const wanted = cartQuantityFor(product.sku, variantId) + 1
            if (available !== null && wanted > available) {
                notify(
                    'danger',
                    'Not enough stock',
                    available === 0
                        ? `${product.name} is out of stock.`
                        : `Only ${available} left in stock for ${product.name}.`,
                )
                return false
            }
            addItem(product, 1, variant)
            return true
        },
        [addItem, cartQuantityFor, fetchAvailable],
    )

    /** Quantity step up, guarded by the live stock. */
    const increaseQuantity = useCallback(
        async (item: POSCartItem) => {
            const available = await fetchAvailable(
                item.product.sku,
                item.variant?.id ?? null,
            )
            if (available !== null && item.quantity + 1 > available) {
                notify(
                    'danger',
                    'Not enough stock',
                    `Only ${available} left in stock for ${item.product.name}.`,
                )
                return
            }
            updateQuantity(posLineKey(item), item.quantity + 1)
        },
        [fetchAvailable, updateQuantity],
    )

    const cashReceived = Number(cash) || 0
    const change = Math.max(0, cashReceived - subtotal)
    const canCheckout =
        branchId !== null &&
        items.length > 0 &&
        cashReceived >= subtotal &&
        !checkingOut &&
        catalog.ready

    const focusScanner = () => skuInputRef.current?.focus()

    const resolveProduct = useCallback(
        (code: string) => {
            const normalized = code.trim()
            if (!normalized) return null
            const lower = normalized.toLowerCase()
            return (
                catalog.products.find((p) => p.sku.toLowerCase() === lower) ??
                catalog.products.find((p) => p.productId.toLowerCase() === lower) ??
                catalog.products.find((p) => p.itemId.toLowerCase() === lower) ??
                null
            )
        },
        [catalog.products],
    )

    const handleAdd = useCallback(
        async (override?: string, options?: { focus?: boolean }) => {
            const code = (override ?? sku).trim()
            if (!code) return
            if (!catalog.ready) {
                notify(
                    'danger',
                    'Catalog not loaded',
                    catalog.error ?? 'Products are still loading. Try again in a moment.',
                )
                if (catalog.error) void catalog.reload()
                return
            }
            setAddingSku(true)
            const product = resolveProduct(code)
            setSku('')
            setActiveIndex(-1)
            if (options?.focus !== false) focusScanner()
            if (!product) {
                // Variant barcode (SD): public scanner lookup, works for cashiers.
                try {
                    const variant =
                        await productOptionVariantsService.findVariantByBarcode(
                            code,
                        )
                    const parent = catalog.products.find(
                        (p) =>
                            p.sku.toLowerCase() ===
                            variant.product?.sku?.toLowerCase(),
                    )
                    if (!parent) {
                        notify(
                            'danger',
                            'Variant not in catalog',
                            `${code} matched ${variant.variantName}, but its parent SKU is not in the POS catalog.`,
                        )
                        setAddingSku(false)
                        return
                    }
                    await addToCart(parent, {
                        id: variant.id,
                        name: variant.variantName,
                        sku: variant.sku,
                        unitPrice: Number(variant.price ?? parent.basePrice),
                    })
                    setAddingSku(false)
                    return
                } catch {
                    /* not an SD variant barcode — try the central registry */
                }

                // Central barcode registry: MM primary / alternative barcode,
                // then SD variant barcode (same lookup MM, SD and POS share).
                try {
                    const hit = await lookupProductBarcode(code)
                    const listing = hit.listing
                    if (listing) {
                        const parent = catalog.products.find(
                            (p) => p.productId === listing.productId,
                        )
                        if (!parent) {
                            notify(
                                'danger',
                                'Not in the POS catalog',
                                `${listing.productName} is listed in another division and cannot be sold here.`,
                            )
                            setAddingSku(false)
                            return
                        }
                        await addToCart(parent, {
                            id: listing.variantId,
                            name: listing.variantName,
                            sku: listing.variantSku,
                            unitPrice: listing.price,
                        })
                        setAddingSku(false)
                        return
                    }
                    if (hit.found) {
                        // The material exists but has no listing in this division.
                        notify(
                            'info',
                            'Not in the catalog',
                            `${hit.material?.name ?? code} exists in Material Master but is not listed. Add the listing to sell it.`,
                        )
                        setCameraOpen(false)
                        setRegisterBarcode(code)
                        setAddingSku(false)
                        return
                    }
                } catch {
                    /* registry unavailable — fall through to registration */
                }

                // Unknown barcode: register the MM material first, then the SD
                // listing. The dialog is shared with the catalog.
                notify(
                    'info',
                    'Barcode not registered',
                    `${code} is not in the catalog. Register the material to sell it.`,
                )
                setCameraOpen(false)
                setRegisterBarcode(code)
                setAddingSku(false)
                return
            }
            // Products with options: ask the cashier to choose the exact variant.
            try {
                const payload = await productOptionVariantsService.getForProduct(
                    product.productId,
                )
                if (payload.hasVariants) {
                    const active = payload.variants.filter(
                        (variant) => variant.isActive,
                    )
                    if (active.length === 0) {
                        notify(
                            'danger',
                            'No variants available',
                            `${product.name} has no active variants.`,
                        )
                        setAddingSku(false)
                        return
                    }
                    if (active.length === 1) {
                        const only = active[0]
                        await addToCart(product, {
                            id: only.id,
                            name: only.variantName,
                            sku: only.sku,
                            unitPrice: Number(only.price ?? product.basePrice),
                        })
                        setAddingSku(false)
                        return
                    }
                    setVariantPicker({
                        product,
                        variants: [...active].sort(
                            (a, b) =>
                                Number(b.isDefault) - Number(a.isDefault) ||
                                a.sortOrder - b.sortOrder,
                        ),
                    })
                    // The picker needs the camera dialog out of the way.
                    setCameraOpen(false)
                    setAddingSku(false)
                    return
                }
            } catch {
                /* variant lookup failed — treat as a simple product */
            }
            await addToCart(product)
            setAddingSku(false)
        },
        [addToCart, catalog.error, catalog.ready, catalog.reload, resolveProduct, sku],
    )

    const handleScanKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' && searchRows > 0) {
            event.preventDefault()
            setSearchFocused(true)
            setActiveIndex((index) => (index + 1) % searchRows)
            return
        }
        if (event.key === 'ArrowUp' && searchRows > 0) {
            event.preventDefault()
            setSearchFocused(true)
            setActiveIndex((index) => (index <= 0 ? searchRows - 1 : index - 1))
            return
        }
        if (event.key === 'Escape') {
            setSearchFocused(false)
            setActiveIndex(-1)
            return
        }
        if (event.key === 'Enter') {
            event.preventDefault()
            if (activeIndex >= 0 && activeIndex < search.products.length) {
                selectSearchProduct(search.products[activeIndex])
                return
            }
            if (activeIndex >= 0 && search.barcode) {
                void selectBarcodeHit(search.barcode.code)
                return
            }
            void handleAdd()
        }
    }

    /** Picking a catalog row is the same path as scanning its SKU. */
    const selectSearchProduct = useCallback(
        (product: RetailProduct) => {
            setSearchFocused(false)
            setActiveIndex(-1)
            void handleAdd(product.sku)
        },
        [handleAdd],
    )

    /**
     * Picking a barcode-registry row: add the existing listing, offer to create
     * one when the material is not listed, otherwise run the normal scan path.
     */
    const selectBarcodeHit = useCallback(
        async (code: string) => {
            setSearchFocused(false)
            setActiveIndex(-1)
            const hit = search.barcode?.code === code ? search.barcode.result : null
            const listing = hit?.listing
            if (listing) {
                const parent = catalog.products.find(
                    (p) => p.productId === listing.productId,
                )
                if (parent) {
                    setSku('')
                    await addToCart(parent, {
                        id: listing.variantId,
                        name: listing.variantName,
                        sku: listing.variantSku,
                        unitPrice: listing.price,
                    })
                    return
                }
            }
            if (hit?.found && !listing) {
                setSku('')
                setCameraOpen(false)
                setRegisterBarcode(code)
                return
            }
            await handleAdd(code)
        },
        [addToCart, catalog.products, handleAdd, search.barcode],
    )

    const handleCameraDetected = useCallback(
        (value: string) => {
            const trimmed = value.trim()
            if (!trimmed) return
            // Keep focus inside the open camera dialog, not the scan field.
            void handleAdd(trimmed, { focus: false })
        },
        [handleAdd],
    )

    const handleConfirmVoid = () => {
        clearCart()
        setCash('')
        setConfirmVoidOpen(false)
        notify('info', 'Transaction voided', 'Cart cleared.')
    }

    const handleCheckout = async () => {
        if (!branchId) return
        // The live stock decides: a line the cart holds more of than the MM
        // ledger allows cannot be sold.
        if (shortLines.length) {
            const [first] = shortLines
            const available = availableFor(first)
            notify(
                'danger',
                'Not enough stock',
                `Only ${available} left in stock for ${first.product.name}. Reduce the quantity before checkout.`,
            )
            return
        }
        setCheckingOut(true)
        try {
            const result = await processPOSCheckout({
                branchId,
                items: items.map((item) => ({
                    sku: item.product.sku,
                    quantity: item.quantity,
                    ...(item.variant
                        ? {
                              variantId: item.variant.id,
                              variantName: item.variant.name,
                              unitPrice: item.variant.unitPrice,
                          }
                        : {}),
                })),
                paymentReceived: cashReceived,
            })
            clearCart()
            setCash('')
            setReceipt(result)
            void refreshStock()
        } catch (error) {
            notify(
                'danger',
                'Checkout failed',
                error instanceof Error ? error.message : 'Unable to complete sale.',
            )
            void catalog.reload()
            void refreshStock()
        } finally {
            setCheckingOut(false)
        }
    }

    useEffect(() => {
        if (branchId) focusScanner()
    }, [branchId])

    const columns = useMemo<ColumnDef<POSCartItem>[]>(
        () => [
            {
                header: 'ITEM',
                id: 'item',
                size: 340,
                cell: ({ row }) => {
                    const { product, variant } = row.original
                    return (
                        <div className="flex min-w-0 items-center gap-3">
                            <PcProductThumbnail
                                src={product.imageUrl}
                                alt={product.name}
                            />
                            <div className="min-w-0">
                                <div className="truncate font-semibold heading-text">
                                    {product.name}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                                    <span className="truncate">
                                        {variant ? variant.name : product.sku}
                                    </span>
                                    {variant ? (
                                        <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                            {variant.sku}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'QTY',
                id: 'quantity',
                size: 150,
                cell: ({ row }) => {
                    const { product, quantity } = row.original
                    const available = availableFor(row.original)
                    const atLimit =
                        available !== null &&
                        available !== Number.POSITIVE_INFINITY &&
                        quantity >= available
                    return (
                        <div className="flex items-center gap-1.5">
                            <Button
                                size="sm"
                                variant="default"
                                className="shrink-0"
                                icon={<HiOutlineMinus />}
                                aria-label={`Decrease ${product.name}`}
                                onClick={() => updateQuantity(posLineKey(row.original), quantity - 1)}
                            />
                            <span className="min-w-[1.75rem] text-center text-base font-semibold tabular-nums">
                                {quantity}
                            </span>
                            <Button
                                size="sm"
                                variant="default"
                                className="shrink-0"
                                disabled={atLimit}
                                title={
                                    atLimit
                                        ? `Only ${available} in stock`
                                        : undefined
                                }
                                icon={<HiOutlinePlus />}
                                aria-label={`Increase ${product.name}`}
                                onClick={() => void increaseQuantity(row.original)}
                            />
                        </div>
                    )
                },
            },
            {
                header: 'STOCK',
                id: 'stock',
                size: 110,
                cell: ({ row }) => {
                    const available = availableFor(row.original)
                    if (available === null) {
                        return (
                            <span className="text-xs text-gray-400">
                                checking…
                            </span>
                        )
                    }
                    if (available === Number.POSITIVE_INFINITY) {
                        return <span className="text-xs text-gray-500">—</span>
                    }
                    const short = row.original.quantity > available
                    return (
                        <div className="text-sm">
                            <div
                                className={
                                    short
                                        ? 'font-semibold text-red-600 dark:text-red-400'
                                        : 'font-medium text-gray-600 dark:text-gray-300'
                                }
                            >
                                {short ? `Only ${available} left` : `${available} in stock`}
                            </div>
                            {short ? (
                                <div className="text-xs text-red-500">
                                    over by {row.original.quantity - available}
                                </div>
                            ) : null}
                        </div>
                    )
                },
            },
            {
                header: 'TOTAL',
                id: 'total',
                size: 130,
                meta: { className: 'text-right' },
                cell: ({ row }) => {
                    const unitPrice =
                        row.original.variant?.unitPrice ??
                        row.original.product.basePrice
                    return (
                        <div className="text-right">
                            <div className="whitespace-nowrap text-base font-bold tabular-nums heading-text">
                                {formatPrice(row.original.itemTotal)}
                            </div>
                            <div className="whitespace-nowrap text-xs text-gray-500 tabular-nums">
                                {formatPrice(unitPrice)} each
                            </div>
                        </div>
                    )
                },
            },
            {
                header: () => <span className="sr-only">Actions</span>,
                id: 'actions',
                size: 60,
                meta: { className: 'text-right' },
                cell: ({ row }) => {
                    const { product } = row.original
                    return (
                        <Button
                            size="sm"
                            variant="plain"
                            className="shrink-0 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            icon={<HiOutlineTrash />}
                            aria-label={`Remove ${product.name}`}
                            onClick={() => removeItem(posLineKey(row.original))}
                        />
                    )
                },
            },
        ],
        [availableFor, increaseQuantity, removeItem, updateQuantity],
    )

    if (!hydrated || !branch) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-white dark:bg-gray-900">
                <Loading loading />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-50 dark:bg-gray-900">
            <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        <HiOutlineOfficeBuilding />
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            POS Terminal
                        </div>
                        <h5 className="truncate font-bold">
                            Terminal: {branch.label}
                        </h5>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        icon={<HiOutlineSwitchHorizontal />}
                        disabled={items.length > 0 || checkingOut}
                        title={
                            items.length > 0
                                ? 'Finish or void the current sale first'
                                : undefined
                        }
                        onClick={() => router.push(POS_GATEWAY_PATH)}
                    >
                        Change branch
                    </Button>
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineLogout />}
                        onClick={() => router.push('/modules/sd')}
                    >
                        Exit POS
                    </Button>
                </div>
            </header>

            <div className="grid flex-1 grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-12 xl:items-start">
                <div className="flex flex-col gap-6 xl:col-span-8">
                    <AdaptiveCard className="border border-gray-200 shadow-sm dark:border-gray-700">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold heading-text">Scan items</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Use a USB barcode wedge, type the SKU or product name
                                to search live, or scan with your device camera.
                            </p>
                        </div>

                        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/40">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Scan SKU / barcode
                            </label>
                            <div className="relative">
                                <Input
                                    ref={skuInputRef}
                                    autoFocus
                                    autoComplete="off"
                                    className="h-14 border-gray-200 bg-white pr-12 font-mono text-lg tracking-wide dark:border-gray-600 dark:bg-gray-900"
                                    placeholder="Scan or type SKU, barcode, or product name…"
                                    value={sku}
                                    onChange={(e) => {
                                        setSku(e.target.value)
                                        setActiveIndex(-1)
                                        setSearchFocused(true)
                                    }}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                    onKeyDown={handleScanKeyDown}
                                />
                                <button
                                    type="button"
                                    className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary dark:hover:bg-gray-700"
                                    aria-label="Scan with camera"
                                    title="Scan with camera"
                                    onClick={() => setCameraOpen(true)}
                                >
                                    <HiOutlineCamera className="text-xl" />
                                </button>

                                {showSearch ? (
                                    <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                        <ul className="max-h-80 overflow-y-auto py-1">
                                            {search.products.map((product, index) => (
                                                <li key={product.productId}>
                                                    <button
                                                        type="button"
                                                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                                                            index === activeIndex
                                                                ? 'bg-primary-subtle dark:bg-primary/15'
                                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                        }`}
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onMouseEnter={() => setActiveIndex(index)}
                                                        onClick={() => selectSearchProduct(product)}
                                                    >
                                                        <PcProductThumbnail
                                                            src={product.imageUrl}
                                                            alt={product.name}
                                                        />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-medium heading-text">
                                                                {product.name}
                                                            </span>
                                                            <span className="block truncate font-mono text-xs text-gray-500">
                                                                {product.sku}
                                                                {product.category
                                                                    ? ` · ${product.category}`
                                                                    : ''}
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 text-sm font-semibold tabular-nums heading-text">
                                                            {formatPrice(product.basePrice)}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}

                                            {search.barcode ? (
                                                <li>
                                                    <button
                                                        type="button"
                                                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                                                            activeIndex === search.products.length
                                                                ? 'bg-primary-subtle dark:bg-primary/15'
                                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                        }`}
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onMouseEnter={() =>
                                                            setActiveIndex(search.products.length)
                                                        }
                                                        onClick={() =>
                                                            void selectBarcodeHit(search.barcode!.code)
                                                        }
                                                    >
                                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                                            <HiOutlineQrcode />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-medium heading-text">
                                                                {search.barcode.result.found
                                                                    ? search.barcode.result.listing
                                                                          ?.productName ??
                                                                      search.barcode.result.material?.name ??
                                                                      search.barcode.code
                                                                    : `Register “${search.barcode.code}”`}
                                                            </span>
                                                            <span className="block truncate font-mono text-xs text-gray-500">
                                                                {search.barcode.code}
                                                                {' · '}
                                                                {search.barcode.result.found
                                                                    ? search.barcode.result.listing
                                                                        ? 'In catalog'
                                                                        : 'Material found — not listed'
                                                                    : 'Barcode not registered'}
                                                            </span>
                                                        </span>
                                                        {search.barcode.result.listing ? (
                                                            <span className="shrink-0 text-sm font-semibold tabular-nums heading-text">
                                                                {formatPrice(
                                                                    search.barcode.result.listing.price,
                                                                )}
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                </li>
                                            ) : null}

                                            {searchRows === 0 ? (
                                                <li className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                                                    <HiOutlineSearch className="text-base" />
                                                    No matching product. Press
                                                    Enter to register this code.
                                                </li>
                                            ) : null}
                                        </ul>
                                        {searchRows > 0 ? (
                                            <div className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 dark:border-gray-700">
                                                {searchRows} result
                                                {searchRows === 1 ? '' : 's'} · ↑↓
                                                to choose · Enter to add
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {canCreate && (
                                <Button
                                    block
                                    size="lg"
                                    variant="solid"
                                    className="h-12 sm:col-span-1"
                                    icon={<HiOutlineQrcode className="text-lg" />}
                                    loading={addingSku}
                                    disabled={!sku.trim() && !catalog.ready}
                                    onClick={() => void handleAdd()}
                                >
                                    Add item
                                </Button>
                            )}
                            <Button
                                block
                                size="lg"
                                variant="default"
                                className="h-12"
                                icon={<HiOutlineCamera className="text-lg" />}
                                disabled={addingSku}
                                onClick={() => setCameraOpen(true)}
                            >
                                Scan with camera
                            </Button>
                            <Button
                                block
                                size="lg"
                                variant="plain"
                                className="h-12"
                                disabled={!catalog.ready && !catalog.error}
                                loading={!catalog.ready && !catalog.error}
                                onClick={() => void catalog.reload()}
                            >
                                Refresh catalog
                            </Button>
                        </div>
                    </AdaptiveCard>

                    <AdaptiveCard className="border border-gray-200 shadow-sm dark:border-gray-700">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-semibold heading-text">
                                    Cart
                                </h3>
                                {items.length > 0 ? (
                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-neutral">
                                        {itemCount}
                                    </span>
                                ) : null}
                            </div>
                            {items.length > 0 ? (
                                <div className="text-right">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                        Subtotal
                                    </div>
                                    <div className="text-lg font-bold tabular-nums heading-text">
                                        {formatPrice(subtotal)}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        {shortLines.length > 0 ? (
                            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                <HiOutlineExclamation className="mt-0.5 shrink-0 text-lg" />
                                <span>
                                    Stock changed:{' '}
                                    {shortLines
                                        .map(
                                            (line) =>
                                                `${line.product.name} (only ${availableFor(line)} left)`,
                                        )
                                        .join(', ')}
                                    . Reduce the quantity before checkout.
                                </span>
                            </div>
                        ) : null}
                        <SdDataTable
                            columns={columns}
                            data={items}
                            noData={items.length === 0}
                            hidePagination
                            customNoDataIcon={
                                <div className="flex flex-col items-center gap-2 py-8 text-center">
                                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-subtle text-2xl text-primary-deep dark:bg-primary/15 dark:text-primary-light">
                                        <HiOutlineShoppingCart />
                                    </span>
                                    <span className="font-semibold heading-text">
                                        Cart is empty
                                    </span>
                                    <span className="max-w-[18rem] text-sm text-gray-500">
                                        Scan a barcode or pick an item from the
                                        catalog to start a sale.
                                    </span>
                                </div>
                            }
                        />
                    </AdaptiveCard>
                </div>

                <div className="xl:col-span-4">
                    <POSCheckoutPanel
                        itemCount={itemCount}
                        lineCount={items.length}
                        subtotal={subtotal}
                        cash={cash}
                        onCashChange={setCash}
                        change={change}
                        checkingOut={checkingOut}
                        canCheckout={canCheckout}
                        onCheckout={() => void handleCheckout()}
                        onVoid={() => setConfirmVoidOpen(true)}
                        formatPrice={formatPrice}
                    />
                </div>
            </div>

            <Dialog
                isOpen={variantPicker !== null}
                width={520}
                shouldReturnFocusAfterClose={false}
                onAfterClose={focusScanner}
                onClose={() => setVariantPicker(null)}
                onRequestClose={() => setVariantPicker(null)}
            >
                <h5 className="mb-1">Choose a variant</h5>
                <p className="mb-4 text-sm text-gray-500">
                    {variantPicker?.product.name}
                </p>
                <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                    {variantPicker?.variants.map((variant) => (
                        <button
                            key={variant.id}
                            type="button"
                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:border-primary hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                            onClick={async () => {
                                if (!variantPicker) return
                                const product = variantPicker.product
                                await addToCart(product, {
                                    id: variant.id,
                                    name: variant.variantName,
                                    sku: variant.sku,
                                    unitPrice: Number(
                                        variant.price ?? product.basePrice,
                                    ),
                                })
                                setVariantPicker(null)
                                focusScanner()
                            }}
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                    {variant.variantName}
                                    {variant.isDefault ? (
                                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                            Default
                                        </span>
                                    ) : null}
                                </span>
                                <span className="block truncate font-mono text-xs text-gray-400">
                                    {variant.sku}
                                </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold">
                                {formatPrice(Number(variant.price))}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="mt-4 flex justify-end">
                    <Button size="sm" onClick={() => setVariantPicker(null)}>
                        Cancel
                    </Button>
                </div>
            </Dialog>

            <CameraBarcodeScanner
                isOpen={cameraOpen}
                continuous
                onClose={() => {
                    setCameraOpen(false)
                    focusScanner()
                }}
                onDetected={handleCameraDetected}
            />

            <BarcodeQuickAddDialog
                isOpen={registerBarcode !== null}
                initialBarcode={registerBarcode ?? ''}
                divisionId={RETAIL_DIVISION_ID}
                onClose={() => {
                    setRegisterBarcode(null)
                    focusScanner()
                }}
                onCreated={(created) => {
                    void catalog.reload()
                    const listing = created.listing
                    if (!listing) return
                    // The material and listing are already saved; add the new
                    // line so the cashier does not have to scan it again.
                    addItem(
                        {
                            productId: listing.productId,
                            itemId: listing.productId,
                            sku: listing.productSku,
                            name: listing.productName,
                            description: created.material?.description ?? '',
                            details: '',
                            features: [],
                            reviews: [],
                            basePrice: listing.price,
                            category: 'General Goods',
                            imageUrl: '',
                            imageGallery: [],
                            salesOrgId: RETAIL_DIVISION_ID,
                        },
                        1,
                        {
                            id: listing.variantId,
                            name: listing.variantName,
                            sku: listing.variantSku,
                            unitPrice: listing.price,
                        },
                    )
                    notify(
                        'success',
                        'Material registered',
                        `${listing.productName} was added to the cart.`,
                    )
                }}
            />

            <ConfirmDialog
                isOpen={confirmVoidOpen}
                type="danger"
                title="Void Transaction?"
                cancelText="Cancel"
                confirmText="Confirm Void"
                confirmButtonProps={{
                    customColorClass: () =>
                        'bg-red-500 hover:bg-red-600 text-white',
                }}
                shouldReturnFocusAfterClose={false}
                onAfterClose={focusScanner}
                onClose={() => setConfirmVoidOpen(false)}
                onRequestClose={() => setConfirmVoidOpen(false)}
                onCancel={() => setConfirmVoidOpen(false)}
                onConfirm={handleConfirmVoid}
            >
                <p>
                    Are you sure you want to clear this cart? All scanned items
                    will be removed.
                </p>
            </ConfirmDialog>
            <Dialog
                isOpen={receipt !== null}
                width={380}
                shouldReturnFocusAfterClose={false}
                onAfterClose={focusScanner}
                onClose={() => setReceipt(null)}
                onRequestClose={() => setReceipt(null)}
            >
                <h5 className="mb-4">Sale complete</h5>
                {receipt ? (
                    <div className="max-h-[60vh] overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                        <POSReceipt
                            receipt={receipt}
                            branchName={branch?.label}
                        />
                    </div>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                    {canCreate && (
                        <Button size="sm" onClick={() => setReceipt(null)}>
                            New sale
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePrinter />}
                        onClick={() => window.print()}
                    >
                        Print
                    </Button>
                </div>
            </Dialog>
            {receipt
                ? createPortal(
                      <div className="print-isolate hidden print:block">
                          <POSReceipt
                              receipt={receipt}
                              branchName={branch?.label}
                          />
                      </div>,
                      document.body,
                  )
                : null}
        </div>
    )
}

export default POSDashboard
