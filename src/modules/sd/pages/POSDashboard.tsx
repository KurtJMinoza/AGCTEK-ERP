'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
    HiOutlineCamera,
    HiOutlineMinus,
    HiOutlinePlus,
    HiOutlinePrinter,
    HiOutlineQrcode,
    HiOutlineTrash,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { toRetailProduct } from '@/services/storefront/retailService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { useDivisionProducts } from '../hooks/useDivisionProducts'
import { usePOSCartStore, type POSCartItem } from '../store/usePOSCartStore'
import {
    processPOSCheckout,
    type POSCheckoutResult,
} from '../services/posService'
import POSReceipt from '../components/POSReceipt'
import POSCheckoutPanel from '../components/POSCheckoutPanel'
import { POS_RETAIL_BRANCH_ID } from '../catalogs/branchCatalog'

const CameraBarcodeScanner = dynamic(
    () => import('@/modules/mm/barcode-rfid/components/CameraBarcodeScanner'),
    { ssr: false },
)

const ROUTE_PATH = '/modules/sd/pos'

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
    const items = usePOSCartStore((s) => s.items)
    const subtotal = usePOSCartStore((s) => s.getCartTotal())
    const addItem = usePOSCartStore((s) => s.addItem)
    const updateQuantity = usePOSCartStore((s) => s.updateQuantity)
    const removeItem = usePOSCartStore((s) => s.removeItem)
    const clearCart = usePOSCartStore((s) => s.clearCart)
    const catalog = useDivisionProducts(RETAIL_DIVISION_ID, toRetailProduct)

    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
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
        items.length > 0 && cashReceived >= subtotal && !checkingOut && catalog.ready

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
                notify('danger', 'Invalid SKU', `${code} is not in the catalog.`)
                setAddingSku(false)
                return
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
        setCheckingOut(true)
        try {
            const result = await processPOSCheckout({
                branchId: POS_RETAIL_BRANCH_ID,
                items: items.map((item) => ({
                    sku: item.product.sku,
                    quantity: item.quantity,
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
        focusScanner()
    }, [])

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
                            {row.original.product.sku}
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
                                onClick={() => updateQuantity(product.sku, quantity - 1)}
                            />
                            <span className="min-w-[2rem] text-center font-semibold tabular-nums">
                                {quantity}
                            </span>
                            <Button
                                size="xs"
                                variant="default"
                                icon={<HiOutlinePlus />}
                                aria-label={`Increase ${product.name}`}
                                onClick={() => updateQuantity(product.sku, quantity + 1)}
                            />
                        </div>
                    )
                },
            },
            {
                header: 'BASE PRICE',
                id: 'basePrice',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-medium tabular-nums">
                        {formatPrice(row.original.product.basePrice)}
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
                            onClick={() => removeItem(product.sku)}
                        />
                    )
                },
            },
        ],
        [removeItem, updateQuantity],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="POS Terminal"
                description="Over-the-counter fast-track sale: immediate stock deduction and cash-sale billing. No delivery."
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Tag className="text-xs font-semibold uppercase tracking-wide">
                    Sales &amp; Distribution
                </Tag>
                <Tag className="border-primary/20 bg-primary-subtle text-xs font-semibold text-primary-deep">
                    POS · AWIC Retail
                </Tag>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
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
                        <POSReceipt receipt={receipt} />
                    </div>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" onClick={() => setReceipt(null)}>
                        New sale
                    </Button>
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
                          <POSReceipt receipt={receipt} />
                      </div>,
                      document.body,
                  )
                : null}
        </PageContainer>
    )
}

export default POSDashboard
