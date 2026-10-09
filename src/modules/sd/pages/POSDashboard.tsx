'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
    HiOutlineCamera,
    HiOutlineLogout,
    HiOutlineMinus,
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlinePrinter,
    HiOutlineQrcode,
    HiOutlineSwitchHorizontal,
    HiOutlineTrash,
} from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { toRetailProduct } from '@/services/storefront/retailService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { useDivisionProducts } from '../hooks/useDivisionProducts'
import {
    usePOSCartStore,
    posLineKey,
    type POSCartItem,
} from '../store/usePOSCartStore'
import {
    productOptionVariantsService,
    type ProductVariantDefinition,
} from '../services/productOptionVariantsService'
import {
    processPOSCheckout,
    type POSCheckoutResult,
} from '../services/posService'
import POSReceipt from '../components/POSReceipt'
import POSCheckoutPanel from '../components/POSCheckoutPanel'
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
    const [cash, setCash] = useState('')
    const [checkingOut, setCheckingOut] = useState(false)
    const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
    const [receipt, setReceipt] = useState<POSCheckoutResult | null>(null)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [addingSku, setAddingSku] = useState(false)

    const itemCount = useMemo(
        () => items.reduce((sum, row) => sum + row.quantity, 0),
        [items],
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
        async (override?: string) => {
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
            focusScanner()
            if (!product) {
                // The code may be a variant barcode — resolve the exact variant.
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
                    addItem(parent, 1, {
                        id: variant.id,
                        name: variant.variantName,
                        sku: variant.sku,
                        unitPrice: Number(variant.price ?? parent.basePrice),
                    })
                    setAddingSku(false)
                    return
                } catch {
                    notify(
                        'danger',
                        'Invalid SKU',
                        `${code} is not in the catalog.`,
                    )
                    setAddingSku(false)
                    return
                }
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
                        addItem(product, 1, {
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
                    setAddingSku(false)
                    return
                }
            } catch {
                /* variant lookup failed — treat as a simple product */
            }
            addItem(product)
            setAddingSku(false)
        },
        [addItem, catalog.error, catalog.ready, catalog.reload, resolveProduct, sku],
    )

    const handleScanKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            void handleAdd()
        }
    }

    const handleCameraDetected = useCallback(
        (value: string) => {
            const trimmed = value.trim()
            if (!trimmed) return
            setSku(trimmed)
            void handleAdd(trimmed)
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
        } catch (error) {
            notify(
                'danger',
                'Checkout failed',
                error instanceof Error ? error.message : 'Unable to complete sale.',
            )
            void catalog.reload()
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
                header: 'NAME',
                id: 'name',
                cell: ({ row }) => (
                    <div className="min-w-[9rem]">
                        <div className="font-semibold heading-text">
                            {row.original.product.name}
                        </div>
                        <div className="text-xs text-gray-500">
                            {row.original.variant
                                ? `${row.original.variant.name} · ${row.original.variant.sku}`
                                : row.original.product.sku}
                        </div>
                    </div>
                ),
            },
            {
                header: 'QTY',
                id: 'quantity',
                cell: ({ row }) => {
                    const { product, quantity } = row.original
                    return (
                        <div className="flex items-center gap-1">
                            <Button
                                size="xs"
                                variant="default"
                                icon={<HiOutlineMinus />}
                                aria-label={`Decrease ${product.name}`}
                                onClick={() => updateQuantity(posLineKey(row.original), quantity - 1)}
                            />
                            <span className="min-w-[2rem] text-center font-semibold tabular-nums">
                                {quantity}
                            </span>
                            <Button
                                size="xs"
                                variant="default"
                                icon={<HiOutlinePlus />}
                                aria-label={`Increase ${product.name}`}
                                onClick={() => updateQuantity(posLineKey(row.original), quantity + 1)}
                            />
                        </div>
                    )
                },
            },
            {
                header: 'PRICE',
                id: 'price',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-medium tabular-nums">
                        {formatPrice(
                            row.original.variant?.unitPrice ??
                                row.original.product.basePrice,
                        )}
                    </span>
                ),
            },
            {
                header: 'ACTIONS',
                id: 'actions',
                cell: ({ row }) => {
                    const { product } = row.original
                    return (
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineTrash />}
                            aria-label={`Remove ${product.name}`}
                            onClick={() => removeItem(posLineKey(row.original))}
                        />
                    )
                },
            },
        ],
        [removeItem, updateQuantity],
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
                                Use a USB barcode wedge, type the SKU, or scan with your device
                                camera.
                            </p>
                        </div>

                        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/40">
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Scan SKU / barcode
                            </label>
                            <Input
                                ref={skuInputRef}
                                autoFocus
                                autoComplete="off"
                                className="h-14 border-gray-200 bg-white font-mono text-lg tracking-wide dark:border-gray-600 dark:bg-gray-900"
                                placeholder="Scan or type SKU…"
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                onKeyDown={handleScanKeyDown}
                            />
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
                        <div className="mb-4 flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold heading-text">Cart</h3>
                            {items.length > 0 ? (
                                <span className="text-sm text-gray-500 tabular-nums">
                                    {formatPrice(subtotal)} subtotal
                                </span>
                            ) : null}
                        </div>
                        <DataTable
                            columns={columns}
                            data={items}
                            noData={items.length === 0}
                            hidePagination
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
                            onClick={() => {
                                if (!variantPicker) return
                                addItem(variantPicker.product, 1, {
                                    id: variant.id,
                                    name: variant.variantName,
                                    sku: variant.sku,
                                    unitPrice: Number(
                                        variant.price ??
                                            variantPicker.product.basePrice,
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
                onClose={() => setCameraOpen(false)}
                onDetected={handleCameraDetected}
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
