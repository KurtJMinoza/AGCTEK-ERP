'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
    HiOutlineMinus,
    HiOutlinePlus,
    HiOutlinePrinter,
    HiOutlineTrash,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
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
import { SALES_BRANCHES, type SalesBranch } from '../catalogs/branchCatalog'

const ROUTE_PATH = '/modules/sd/pos'
/** Remembers the terminal's branch so the cashier picks it once per device. */
const BRANCH_STORAGE_KEY = 'sd-pos-branch'

type BranchOption = { value: string; label: string; branch: SalesBranch }

const BRANCH_OPTIONS: BranchOption[] = SALES_BRANCHES.map((branch) => ({
    value: branch.id,
    label: branch.label,
    branch,
}))

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
    const [branchId, setBranchId] = useState<string | null>(null)

    useEffect(() => {
        const saved = window.localStorage.getItem(BRANCH_STORAGE_KEY)
        if (saved && SALES_BRANCHES.some((b) => b.id === saved)) setBranchId(saved)
    }, [])

    const selectBranch = (next: string | null) => {
        setBranchId(next)
        if (next) window.localStorage.setItem(BRANCH_STORAGE_KEY, next)
        else window.localStorage.removeItem(BRANCH_STORAGE_KEY)
    }

    const cashReceived = Number(cash) || 0
    const canCheckout =
        branchId !== null &&
        items.length > 0 &&
        cashReceived >= subtotal &&
        !checkingOut

    const focusScanner = () => skuInputRef.current?.focus()

    const handleAdd = () => {
        const code = sku.trim()
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
        const product = catalog.products.find(
            (p) => p.sku.toLowerCase() === code.toLowerCase(),
        )
        setSku('')
        focusScanner()
        if (!product) {
            notify('danger', 'Invalid SKU', `${code} is not in the catalog.`)
            return
        }
        addItem(product)
    }

    const handleScanKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            handleAdd()
        }
    }

    const handleConfirmVoid = () => {
        clearCart()
        setCash('')
        setConfirmVoidOpen(false)
        notify('info', 'Transaction voided', 'Cart cleared.')
    }

    const handleCheckout = async () => {
        if (!branchId) {
            notify('danger', 'Select a branch', 'Choose the selling branch before completing the sale.')
            return
        }
        setCheckingOut(true)
        try {
            const result = await processPOSCheckout({
                branchId,
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

    const columns = useMemo<ColumnDef<POSCartItem>[]>(
        () => [
            {
                header: 'Name',
                id: 'name',
                cell: ({ row }) => (
                    <div className="min-w-[9rem]">
                        <div className="font-semibold">{row.original.product.name}</div>
                        <div className="text-xs text-gray-500">
                            {row.original.product.sku}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Qty',
                id: 'quantity',
                cell: ({ row }) => row.original.quantity,
            },
            {
                header: 'Base Price',
                id: 'basePrice',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">
                        {formatPrice(row.original.product.basePrice)}
                    </span>
                ),
            },
            {
                header: 'Actions',
                id: 'actions',
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
                            <Button
                                size="xs"
                                variant="default"
                                icon={<HiOutlinePlus />}
                                aria-label={`Increase ${product.name}`}
                                onClick={() => updateQuantity(product.sku, quantity + 1)}
                            />
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlineTrash />}
                                aria-label={`Remove ${product.name}`}
                                onClick={() => removeItem(product.sku)}
                            />
                        </div>
                    )
                },
            },
        ],
        [updateQuantity, removeItem],
    )

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="POS Terminal"
                description="Over-the-counter fast-track sale: immediate stock deduction and cash-sale billing. No delivery."
            />
            <Card className="mb-4" bodyClass="py-3">
                <FormItem
                    label="Select Branch"
                    asterisk
                    layout="horizontal"
                    className="mb-0"
                    invalid={branchId === null}
                    errorMessage={
                        branchId === null
                            ? 'Required before completing a sale'
                            : undefined
                    }
                >
                    <div className="w-full sm:w-72">
                        <Select<BranchOption>
                            isSearchable={false}
                            placeholder="Select branch..."
                            options={BRANCH_OPTIONS}
                            value={
                                BRANCH_OPTIONS.find((o) => o.value === branchId) ??
                                null
                            }
                            onChange={(option) => selectBranch(option?.value ?? null)}
                        />
                    </div>
                </FormItem>
            </Card>
            <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
                <Card
                    className="min-w-0 lg:col-span-2"
                    header={{ content: 'Scan items' }}
                >
                    <div className="flex gap-2">
                        <Input
                            ref={skuInputRef}
                            autoFocus
                            placeholder="Scan SKU"
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            onKeyDown={handleScanKeyDown}
                        />
                        <Button
                            variant="solid"
                            disabled={!sku.trim()}
                            onClick={handleAdd}
                        >
                            Add
                        </Button>
                    </div>
                    <div className="mt-4">
                        <DataTable
                            columns={columns}
                            data={items}
                            noData={items.length === 0}
                            hidePagination
                        />
                    </div>
                </Card>

                <Card className="lg:sticky lg:top-4" header={{ content: 'Checkout' }}>
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-lg font-bold">
                            <span>Total</span>
                            <span>{formatPrice(subtotal)}</span>
                        </div>
                        <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            placeholder="Cash received"
                            value={cash}
                            onChange={(e) => setCash(e.target.value)}
                        />
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Change</span>
                            <span>
                                {formatPrice(Math.max(0, cashReceived - subtotal))}
                            </span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Button
                                block
                                variant="solid"
                                loading={checkingOut}
                                disabled={!canCheckout}
                                onClick={handleCheckout}
                            >
                                Tender Cash &amp; Checkout
                            </Button>
                            {branchId === null && items.length > 0 ? (
                                <p className="text-center text-xs text-red-500">
                                    Select a branch above to complete the sale.
                                </p>
                            ) : null}
                            <Button
                                block
                                variant="solid"
                                customColorClass={() =>
                                    'bg-red-500 hover:bg-red-600 text-white'
                                }
                                disabled={items.length === 0 || checkingOut}
                                onClick={() => setConfirmVoidOpen(true)}
                            >
                                Void Transaction
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
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
