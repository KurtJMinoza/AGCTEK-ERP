'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import {
    HiOutlineCheckCircle,
    HiOutlineCube,
    HiOutlineDocumentAdd,
    HiOutlineExclamationCircle,
    HiOutlineGlobeAlt,
    HiOutlineOfficeBuilding,
    HiOutlinePencilAlt,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineCreditCard,
} from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import Alert from '@/components/ui/Alert'
import { FormItem } from '@/components/ui/Form'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { getCustomers } from '../services/customerMasterService'
import { listProducts } from '../services/productCatalogService'
import {
    createExtPlatformTransaction,
    fetchExtPlatformStock,
    previewExtPlatformTransaction,
    updateExtPlatformTransaction,
} from '../services/extPlatformService'
import type {
    ExtPlatformStock,
    ExtPlatformTaxPreview,
    ExtPlatformTaxPreviewLine,
    ExtPlatformTransaction,
    SalesSource,
} from '../types/extPlatform'
import { formatSdMoney } from './SdDataTableCells'
import {
    PAYMENT_METHODS,
    SourceBadge,
    SourceIcon,
    TaxClassTag,
    sourceColorClass,
} from './extPlatformUi'

type Option = { value: string; label: string }
/** One sellable SD Product Catalog entry: a SIMPLE product, or one variant of a VARIABLE product. */
type CatalogOption = Option & {
    productId: string
    variantId: string
    name: string
    variantName: string
    sku: string
    divisionId: string
    price: number
    /** MM available quantity; null until loaded. */
    available: number | null
    stockState: string | null
}

/** Max catalog items per stock request (backend limit). */
const STOCK_QUERY_LIMIT = 2000

/** Out of stock for a company-owned sale; services / unmapped items are not stock-limited here. */
const isOutOfStock = (o: CatalogOption) =>
    o.available !== null &&
    o.stockState !== 'NON_INVENTORY' &&
    o.stockState !== 'NOT_MAPPED' &&
    o.available <= 0

type DraftLine = {
    key: string
    productId: string
    /** '' for SIMPLE products. */
    variantId: string
    quantity: string
    unitPrice: string
    discount: string
}

const catalogKey = (productId: string, variantId: string) => `${productId}:${variantId}`

type HeaderErrors = Partial<
    Record<'source' | 'company' | 'date' | 'lines', string>
>

const PREVIEW_DEBOUNCE_MS = 400

let lineSeq = 0
const blankLine = (): DraftLine => ({
    key: `ln_${++lineSeq}`,
    productId: '',
    variantId: '',
    quantity: '1',
    unitPrice: '',
    discount: '',
})

const num = (value: string) => (value.trim() === '' ? 0 : Number(value))
const money = (value: number) => formatSdMoney(value)

/** Helper text under a control; FormItem's `extra` renders inside the label and breaks row alignment. */
const Hint = ({ children }: { children: ReactNode }) => (
    <p className="mt-1 text-xs text-gray-400">{children}</p>
)

function Section({
    step,
    icon,
    title,
    description,
    action,
    children,
}: {
    step: number
    icon: ReactNode
    title: string
    description?: string
    action?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm text-primary">
                        {icon}
                    </span>
                    <div>
                        <h5 className="text-sm font-semibold heading-text">
                            <span className="mr-1.5 text-gray-400">{step}.</span>
                            {title}
                        </h5>
                        {description ? (
                            <p className="text-xs text-gray-500">{description}</p>
                        ) : null}
                    </div>
                </div>
                {action}
            </header>
            <div className="p-4">{children}</div>
        </section>
    )
}

function StockChip({ option }: { option: CatalogOption }) {
    if (option.available === null) return null
    if (option.stockState === 'NON_INVENTORY') {
        return <span className="shrink-0 text-gray-400">Non-stock</span>
    }
    if (option.stockState === 'NOT_MAPPED') {
        return <span className="shrink-0 text-amber-600">No MM material</span>
    }
    if (option.available <= 0) {
        return <span className="shrink-0 font-semibold text-red-500">Out of stock</span>
    }
    return (
        <span className={`shrink-0 font-semibold ${option.stockState === 'LOW_STOCK' ? 'text-amber-600' : 'text-emerald-600'}`}>
            {option.available} in stock
        </span>
    )
}

function SummaryRow({
    label,
    value,
    muted,
    negative,
    strong,
}: {
    label: string
    value: number
    muted?: boolean
    negative?: boolean
    strong?: boolean
}) {
    return (
        <div
            className={`flex items-center justify-between py-1 text-sm ${muted ? 'text-gray-500' : ''} ${strong ? 'font-semibold heading-text' : ''}`}
        >
            <span>{label}</span>
            <span className="tabular-nums">
                {negative && value > 0 ? '− ' : ''}
                {money(value)}
            </span>
        </div>
    )
}

export type ExtPlatformTransactionDialogProps = {
    isOpen: boolean
    onClose: () => void
    onSaved: (tx: ExtPlatformTransaction) => void
    sources: SalesSource[]
    companies: Option[]
    /** Draft being edited; omit to create a new transaction. */
    editing?: ExtPlatformTransaction | null
}

export default function ExtPlatformTransactionDialog({
    isOpen,
    onClose,
    onSaved,
    sources,
    companies,
    editing,
}: ExtPlatformTransactionDialogProps) {
    const isEdit = Boolean(editing)
    const activeSources = useMemo(
        () => sources.filter((s) => s.isActive || s.id === editing?.salesSourceId),
        [sources, editing],
    )

    // Header
    const [salesSourceId, setSalesSourceId] = useState('')
    const [platformName, setPlatformName] = useState('')
    const [orderRef, setOrderRef] = useState('')
    const [transactionDate, setTransactionDate] = useState<Date | null>(new Date())
    const [companyId, setCompanyId] = useState('')
    const [branchId, setBranchId] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [settlementRef, setSettlementRef] = useState('')
    const [platformFees, setPlatformFees] = useState('')
    const [remarks, setRemarks] = useState('')
    const [isCompanyInventory, setIsCompanyInventory] = useState(true)
    const [lines, setLines] = useState<DraftLine[]>([])

    // Reference data
    const [catalog, setCatalog] = useState<CatalogOption[]>([])
    const [stockError, setStockError] = useState(false)
    const [customers, setCustomers] = useState<Option[]>([])
    const [branches, setBranches] = useState<Option[]>([])

    // Tax preview + submit state
    const [preview, setPreview] = useState<{
        data: ExtPlatformTaxPreview
        keys: string[]
    } | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [previewError, setPreviewError] = useState('')
    const [errors, setErrors] = useState<HeaderErrors>({})
    const [lineErrors, setLineErrors] = useState<Record<string, string>>({})
    const [submitError, setSubmitError] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset the form each time it opens.
    useEffect(() => {
        if (!isOpen) return
        setErrors({})
        setLineErrors({})
        setSubmitError('')
        setPreview(null)
        setPreviewError('')
        setStockError(false)
        if (editing) {
            setSalesSourceId(editing.salesSourceId)
            setPlatformName(editing.externalPlatformName ?? '')
            setOrderRef(editing.externalOrderRef ?? '')
            setTransactionDate(dayjs(editing.transactionDate).toDate())
            setCompanyId(editing.companyId)
            setBranchId(editing.branchId ?? '')
            setCustomerId(editing.customerId ?? '')
            setCustomerName(editing.customerName ?? '')
            setPaymentMethod(editing.paymentMethod ?? '')
            setSettlementRef(editing.settlementReference ?? '')
            setPlatformFees(Number(editing.platformFees) ? String(Number(editing.platformFees)) : '')
            setRemarks(editing.remarks ?? '')
            setIsCompanyInventory(editing.isCompanyInventory)
            setLines(
                editing.lines.map((l) => ({
                    key: `ln_${++lineSeq}`,
                    productId: l.productId ?? '',
                    variantId: l.variantId ?? '',
                    quantity: String(Number(l.quantity)),
                    unitPrice: String(Number(l.unitPrice)),
                    discount: Number(l.discount) ? String(Number(l.discount)) : '',
                })),
            )
        } else {
            setSalesSourceId('')
            setPlatformName('')
            setOrderRef('')
            setTransactionDate(new Date())
            setCompanyId(companies.length === 1 ? companies[0].value : '')
            setBranchId('')
            setCustomerId('')
            setCustomerName('')
            setPaymentMethod('PLATFORM_PAYOUT')
            setSettlementRef('')
            setPlatformFees('')
            setRemarks('')
            setIsCompanyInventory(true)
            setLines([blankLine()])
        }
    }, [isOpen, editing, companies])

    // Catalog and customers are loaded once per opening.
    useEffect(() => {
        if (!isOpen) return
        listProducts({ activeOnly: true })
            .then(async (products) => {
                const options = products.flatMap((p) => {
                    const entry = (variant?: { id: string; name: string; sku: string; price: number | null }): CatalogOption => ({
                        value: catalogKey(p.id, variant?.id ?? ''),
                        label: `${p.name} ${variant?.name ?? ''} ${variant?.sku ?? p.sku}`,
                        productId: p.id,
                        variantId: variant?.id ?? '',
                        name: p.name,
                        variantName: variant?.name ?? '',
                        sku: variant?.sku ?? p.sku,
                        divisionId: p.divisionId,
                        price: variant?.price ?? p.price,
                        available: null,
                        stockState: null,
                    })
                    return p.productConfig === 'VARIABLE' && p.variants?.length
                        ? p.variants.map(entry)
                        : [entry()]
                })
                setCatalog(options)
                // Stock comes from MM (same ATP as the POS); the list stays usable if it fails.
                const stock = new Map<string, ExtPlatformStock>()
                for (let i = 0; i < options.length; i += STOCK_QUERY_LIMIT) {
                    const rows = await fetchExtPlatformStock(
                        options.slice(i, i + STOCK_QUERY_LIMIT).map((o) => ({
                            productId: o.productId,
                            variantId: o.variantId || undefined,
                        })),
                    )
                    rows.forEach((row) => stock.set(catalogKey(row.productId, row.variantId ?? ''), row))
                }
                setCatalog(
                    options.map((o) => {
                        const row = stock.get(o.value)
                        return row ? { ...o, available: row.availableQuantity, stockState: row.state } : o
                    }),
                )
            })
            .catch(() => setStockError(true))
        getCustomers({ status: 'ACTIVE' })
            .then((list) =>
                setCustomers(
                    list.map((c) => ({
                        value: c.id,
                        label: `${c.companyName} · ${c.customerNumber}`,
                    })),
                ),
            )
            .catch(() => setCustomers([]))
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || !companyId) {
            setBranches([])
            return
        }
        orgService
            .branches({ companyId, activeOnly: true })
            .then((list) =>
                setBranches(list.map((b) => ({ value: b.id, label: b.name }))),
            )
            .catch(() => setBranches([]))
    }, [isOpen, companyId])

    const catalogByKey = useMemo(
        () => new Map(catalog.map((c) => [c.value, c])),
        [catalog],
    )
    const selectedSource = activeSources.find((s) => s.id === salesSourceId)
    const ymd = transactionDate ? dayjs(transactionDate).format('YYYY-MM-DD') : ''

    // Live SD tax determination: complete lines only, debounced.
    const previewInput = useMemo(() => {
        const ready = lines.filter(
            (l) => l.productId && num(l.quantity) > 0 && l.unitPrice.trim() !== '',
        )
        return {
            keys: ready.map((l) => l.key),
            body: {
                companyId,
                transactionDate: ymd,
                isCompanyInventory,
                platformFees: num(platformFees),
                lines: ready.map((l) => ({
                    productId: l.productId,
                    variantId: l.variantId || undefined,
                    quantity: num(l.quantity),
                    unitPrice: num(l.unitPrice),
                    discount: num(l.discount),
                })),
            },
        }
    }, [lines, companyId, ymd, platformFees, isCompanyInventory])
    const previewKey = JSON.stringify(previewInput)

    useEffect(() => {
        if (!isOpen || !previewInput.body.companyId || !ymd || previewInput.keys.length === 0) {
            setPreview(null)
            setPreviewError('')
            setPreviewing(false)
            return
        }
        let cancelled = false
        setPreviewing(true)
        const timer = setTimeout(() => {
            previewExtPlatformTransaction(previewInput.body)
                .then((data) => {
                    if (cancelled) return
                    setPreview({ data, keys: previewInput.keys })
                    setPreviewError('')
                })
                .catch((err) => {
                    if (cancelled) return
                    setPreview(null)
                    setPreviewError(err instanceof Error ? err.message : 'Unable to calculate tax')
                })
                .finally(() => !cancelled && setPreviewing(false))
        }, PREVIEW_DEBOUNCE_MS)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // previewKey captures every input of the request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, previewKey])

    const previewByKey = useMemo(() => {
        const map = new Map<string, ExtPlatformTaxPreviewLine>()
        preview?.keys.forEach((key, i) => {
            const line = preview.data.lines[i]
            if (line) map.set(key, line)
        })
        return map
    }, [preview])

    const updateLine = (key: string, patch: Partial<DraftLine>) => {
        setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
        setLineErrors((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
    }

    const validate = () => {
        const nextErrors: HeaderErrors = {}
        const nextLineErrors: Record<string, string> = {}
        if (!salesSourceId) nextErrors.source = 'Choose where the sale happened.'
        if (!companyId) nextErrors.company = 'Company is required.'
        if (!transactionDate) nextErrors.date = 'Transaction date is required.'
        else if (dayjs(transactionDate).isAfter(dayjs(), 'day')) {
            nextErrors.date = 'Transaction date cannot be in the future.'
        }
        if (lines.length === 0) nextErrors.lines = 'Add at least one product.'
        for (const l of lines) {
            const qty = num(l.quantity)
            const price = num(l.unitPrice)
            const discount = num(l.discount)
            const linkError = previewByKey.get(l.key)?.error
            if (!l.productId) nextLineErrors[l.key] = 'Select a product.'
            else if (linkError) nextLineErrors[l.key] = linkError
            else if (!(qty > 0)) nextLineErrors[l.key] = 'Quantity must be greater than zero.'
            else if (l.unitPrice.trim() === '' || price < 0) nextLineErrors[l.key] = 'Enter the selling price.'
            else if (discount < 0 || discount > qty * price) {
                nextLineErrors[l.key] = 'Discount cannot exceed the line amount.'
            }
        }
        setErrors(nextErrors)
        setLineErrors(nextLineErrors)
        return Object.keys(nextErrors).length === 0 && Object.keys(nextLineErrors).length === 0
    }

    const handleSave = async () => {
        setSubmitError('')
        if (!validate()) return
        setSaving(true)
        const linePayload = lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId || undefined,
            quantity: num(l.quantity),
            unitPrice: num(l.unitPrice),
            discount: num(l.discount),
        }))
        const common = {
            salesSourceId,
            externalPlatformName: platformName.trim() || undefined,
            externalOrderRef: orderRef.trim() || undefined,
            transactionDate: ymd,
            customerName: customerName.trim() || undefined,
            paymentMethod: paymentMethod || undefined,
            settlementReference: settlementRef.trim() || undefined,
            platformFees: num(platformFees),
            remarks: remarks.trim() || undefined,
            isCompanyInventory,
            lines: linePayload,
        }
        try {
            const saved = editing
                ? await updateExtPlatformTransaction(editing.id, {
                      ...common,
                      externalOrderRef: orderRef.trim(),
                      branchId: branchId || null,
                      customerId: customerId || null,
                  })
                : await createExtPlatformTransaction({
                      ...common,
                      companyId,
                      branchId: branchId || undefined,
                      customerId: customerId || undefined,
                  })
            onSaved(saved)
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Unable to save transaction')
        } finally {
            setSaving(false)
        }
    }

    const totals = preview?.data.totals
    const completeLines = lines.filter((l) => l.productId).length

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            width={1180}
            icon={isEdit ? <HiOutlinePencilAlt /> : <HiOutlineDocumentAdd />}
            title={
                isEdit
                    ? `Edit ${editing?.transactionNumber}`
                    : 'Add External Platform Transaction'
            }
            description="Record a sale made on Shopee, Lazada, TikTok Shop or another channel. Tax is determined from each product's MM tax setup and FICO tax code."
            bodyClassName="bg-gray-50 dark:bg-gray-900/40"
            footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-gray-500">
                        {totals ? (
                            <>
                                Total{' '}
                                <span className="font-semibold heading-text tabular-nums">
                                    {money(totals.grandTotal)}
                                </span>{' '}
                                · {completeLines} product{completeLines === 1 ? '' : 's'}
                            </>
                        ) : (
                            'Saved as Draft — confirm and approve it from the list.'
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="solid"
                            loading={saving}
                            icon={<HiOutlineCheckCircle />}
                            onClick={() => void handleSave()}
                        >
                            {isEdit ? 'Save changes' : 'Save as draft'}
                        </Button>
                    </div>
                </div>
            }
        >
            {submitError ? (
                <Alert type="danger" showIcon className="mb-4">
                    {submitError}
                </Alert>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                    {/* 1. Channel */}
                    <Section
                        step={1}
                        icon={<HiOutlineGlobeAlt />}
                        title="Sales channel"
                        description="Where the customer bought. This label stays on every line and report."
                    >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                            {activeSources.map((s) => {
                                const selected = s.id === salesSourceId
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => {
                                            setSalesSourceId(s.id)
                                            setErrors((e) => ({ ...e, source: undefined }))
                                        }}
                                        className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] font-semibold uppercase tracking-wide transition ${
                                            selected
                                                ? `${sourceColorClass(s.badgeColor)} border-transparent ring-2 ring-primary`
                                                : 'border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                        }`}
                                    >
                                        {selected ? (
                                            <HiOutlineCheckCircle className="absolute right-1.5 top-1.5 h-4 w-4 text-primary" />
                                        ) : null}
                                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:text-white dark:ring-gray-700">
                                            <SourceIcon code={s.code} className="h-5 w-5" />
                                        </span>
                                        <span className="leading-tight text-center">{s.name}</span>
                                    </button>
                                )
                            })}
                        </div>
                        {errors.source ? (
                            <p className="mt-2 text-xs text-red-500">{errors.source}</p>
                        ) : null}

                        <div className="mt-4 grid gap-x-4 sm:grid-cols-3">
                            <FormItem label="External order reference">
                                <Input
                                    size="sm"
                                    placeholder="e.g. LZ-240812345"
                                    value={orderRef}
                                    onChange={(e) => setOrderRef(e.target.value)}
                                />
                                <Hint>Must be unique per channel</Hint>
                            </FormItem>
                            <FormItem label="Store name (optional)">
                                <Input
                                    size="sm"
                                    placeholder={
                                        selectedSource?.code === 'OTHER'
                                            ? 'Name of the platform'
                                            : 'e.g. AWIC Official Store'
                                    }
                                    value={platformName}
                                    onChange={(e) => setPlatformName(e.target.value)}
                                />
                            </FormItem>
                            <FormItem
                                label="Transaction date"
                                asterisk
                                invalid={Boolean(errors.date)}
                                errorMessage={errors.date}
                            >
                                <DatePicker
                                    size="sm"
                                    inputtable
                                    value={transactionDate}
                                    maxDate={new Date()}
                                    onChange={(d) => {
                                        setTransactionDate(d)
                                        setErrors((e) => ({ ...e, date: undefined }))
                                    }}
                                />
                            </FormItem>
                        </div>
                    </Section>

                    {/* 2. Seller and customer */}
                    <Section
                        step={2}
                        icon={<HiOutlineOfficeBuilding />}
                        title="Seller & customer"
                    >
                        <div className="grid gap-x-4 sm:grid-cols-2">
                            <FormItem
                                label="Company"
                                asterisk
                                invalid={Boolean(errors.company)}
                                errorMessage={errors.company}
                            >
                                <Select<Option>
                                    size="sm"
                                    isDisabled={isEdit}
                                    placeholder="Select company"
                                    options={companies}
                                    value={companies.find((c) => c.value === companyId) ?? null}
                                    onChange={(o) => {
                                        setCompanyId(o?.value ?? '')
                                        setBranchId('')
                                        setErrors((e) => ({ ...e, company: undefined }))
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Branch">
                                <Select<Option>
                                    size="sm"
                                    isClearable
                                    isDisabled={!companyId}
                                    placeholder={companyId ? 'Optional' : 'Select a company first'}
                                    options={branches}
                                    value={branches.find((b) => b.value === branchId) ?? null}
                                    onChange={(o) => setBranchId(o?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Customer master (optional)">
                                <Select<Option>
                                    size="sm"
                                    isClearable
                                    placeholder="Search customer…"
                                    options={customers}
                                    value={customers.find((c) => c.value === customerId) ?? null}
                                    onChange={(o) => {
                                        setCustomerId(o?.value ?? '')
                                        if (o && !customerName.trim()) {
                                            setCustomerName(o.label.split(' · ')[0])
                                        }
                                    }}
                                />
                            </FormItem>
                            <FormItem label="Customer name">
                                <Input
                                    size="sm"
                                    placeholder="Buyer name shown on the platform"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                />
                            </FormItem>
                        </div>
                    </Section>

                    {/* 3. Products */}
                    <Section
                        step={3}
                        icon={<HiOutlineCube />}
                        title="Products"
                        description="Products come from the SD Product Catalog. Each must be linked to an MM material, which supplies its tax classification."
                        action={
                            previewing ? (
                                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                    <Spinner size={14} /> Calculating tax…
                                </span>
                            ) : null
                        }
                    >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                                <span className="font-semibold">Whose stock was sold?</span>{' '}
                                {isCompanyInventory
                                    ? 'Only products in stock can be picked and quantities cannot exceed MM availability. Goods issue is not posted from this screen — post it in MM.'
                                    : 'Third-party stock: company inventory is not checked or affected.'}
                            </div>
                            <Segment
                                size="sm"
                                value={isCompanyInventory ? 'company' : 'third'}
                                onChange={(v) => setIsCompanyInventory(v === 'company')}
                            >
                                <Segment.Item value="company">Company-owned</Segment.Item>
                                <Segment.Item value="third">Third-party</Segment.Item>
                            </Segment>
                        </div>
                        {stockError ? (
                            <Alert type="warning" showIcon className="mb-3">
                                Stock levels could not be loaded. Availability is still checked when the tax is calculated and when you save.
                            </Alert>
                        ) : null}

                        {/* Same border + padding as the rows so headings sit over their inputs. */}
                        <div className="hidden grid-cols-12 gap-2 border border-transparent px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 md:grid">
                            <div className="col-span-4">Product</div>
                            <div className="col-span-2 text-right">Qty</div>
                            <div className="col-span-2 text-right">Unit price</div>
                            <div className="col-span-2 text-right">Discount</div>
                            <div className="col-span-2 pr-7 text-right">Amount</div>
                        </div>

                        <div className="space-y-2">
                            {lines.map((line, index) => {
                                const item = catalogByKey.get(catalogKey(line.productId, line.variantId))
                                const result = previewByKey.get(line.key)
                                const tax = result?.error === undefined ? result : undefined
                                const error = lineErrors[line.key] ?? result?.error
                                return (
                                    <div
                                        key={line.key}
                                        className={`rounded-lg border p-2 ${error ? 'border-red-300 bg-red-50/50 dark:border-red-500/50 dark:bg-red-500/5' : 'border-gray-200 dark:border-gray-700'}`}
                                    >
                                        <div className="grid grid-cols-12 items-center gap-2">
                                            <div className="col-span-12 md:col-span-4">
                                                <Select<CatalogOption>
                                                    size="sm"
                                                    placeholder={`Product ${index + 1} — search name or SKU`}
                                                    options={catalog}
                                                    value={item ?? null}
                                                    isOptionDisabled={(o) => isCompanyInventory && isOutOfStock(o)}
                                                    formatOptionLabel={(o, { context }) =>
                                                        // One line in the control keeps it the same height as the inputs beside it.
                                                        context === 'value' ? (
                                                            <span className="truncate">
                                                                {o.name}
                                                                {o.variantName ? ` — ${o.variantName}` : ''}
                                                            </span>
                                                        ) : (
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm">
                                                                    {o.name}
                                                                    {o.variantName ? (
                                                                        <span className="text-gray-500"> — {o.variantName}</span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                                                                    <span className="truncate">
                                                                        {o.sku} · {money(o.price)}
                                                                    </span>
                                                                    <StockChip option={o} />
                                                                </div>
                                                            </div>
                                                        )
                                                    }
                                                    onChange={(o) =>
                                                        updateLine(line.key, {
                                                            productId: o?.productId ?? '',
                                                            variantId: o?.variantId ?? '',
                                                            // Catalog price is the starting point; overwrite with what the buyer paid on the platform.
                                                            unitPrice: o ? String(o.price) : line.unitPrice,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="col-span-4 md:col-span-2">
                                                <Input
                                                    size="sm"
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    className="text-right"
                                                    value={line.quantity}
                                                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                                                />
                                            </div>
                                            <div className="col-span-4 md:col-span-2">
                                                <Input
                                                    size="sm"
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    prefix="₱"
                                                    placeholder="0.00"
                                                    className="text-right"
                                                    value={line.unitPrice}
                                                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                                                />
                                            </div>
                                            <div className="col-span-4 md:col-span-2">
                                                <Input
                                                    size="sm"
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    prefix="₱"
                                                    placeholder="0.00"
                                                    className="text-right"
                                                    value={line.discount}
                                                    onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                                                />
                                            </div>
                                            <div className="col-span-12 flex items-center justify-end gap-1 md:col-span-2">
                                                <div className="min-w-0 text-right">
                                                    <div className="text-sm font-semibold tabular-nums heading-text">
                                                        {tax ? money(tax.grossAmount) : '—'}
                                                    </div>
                                                    {tax ? (
                                                        <div className="mt-0.5 flex justify-end">
                                                            <TaxClassTag
                                                                classification={tax.taxClassification}
                                                                taxCode={tax.taxCode}
                                                                taxRate={tax.taxRate}
                                                            />
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    type="button"
                                                    aria-label={`Remove product ${index + 1}`}
                                                    icon={<HiOutlineTrash />}
                                                    className="shrink-0 text-gray-400 hover:text-red-500"
                                                    disabled={lines.length === 1}
                                                    onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                                                />
                                            </div>
                                        </div>
                                        {tax ? (
                                            <p className="mt-1 flex flex-wrap justify-between gap-x-3 px-1 text-[11px] text-gray-500 tabular-nums">
                                                <span>MM material {tax.materialCode}</span>
                                                <span>
                                                    {[
                                                        tax.taxAmount > 0 ? `VAT ${money(tax.taxAmount)}` : '',
                                                        tax.calculationMethod === 'TAX_INCLUSIVE'
                                                            ? 'price includes VAT'
                                                            : tax.calculationMethod
                                                              ? 'VAT added on top'
                                                              : '',
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </span>
                                            </p>
                                        ) : null}
                                        {error ? (
                                            <p className="mt-1 flex items-center gap-1 px-1 text-xs text-red-500">
                                                <HiOutlineExclamationCircle /> {error}
                                            </p>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={() => setLines((prev) => [...prev, blankLine()])}
                            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-500 transition hover:border-primary hover:text-primary dark:border-gray-600"
                        >
                            <HiOutlinePlus /> Add product
                        </button>
                        {errors.lines ? (
                            <p className="mt-2 text-xs text-red-500">{errors.lines}</p>
                        ) : null}
                        {previewError ? (
                            <Alert type="warning" showIcon className="mt-3">
                                {previewError}
                            </Alert>
                        ) : null}
                    </Section>

                    {/* 4. Payment */}
                    <Section
                        step={4}
                        icon={<HiOutlineCreditCard />}
                        title="Payment & settlement"
                    >
                        <div className="grid gap-x-4 sm:grid-cols-3">
                            <FormItem label="Payment method">
                                <Select<Option>
                                    size="sm"
                                    isClearable
                                    options={PAYMENT_METHODS}
                                    value={PAYMENT_METHODS.find((p) => p.value === paymentMethod) ?? null}
                                    onChange={(o) => setPaymentMethod(o?.value ?? '')}
                                />
                            </FormItem>
                            <FormItem label="Settlement / payout reference">
                                <Input
                                    size="sm"
                                    placeholder="Payout or statement ID"
                                    value={settlementRef}
                                    onChange={(e) => setSettlementRef(e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Platform fees">
                                <Input
                                    size="sm"
                                    type="number"
                                    min={0}
                                    step="any"
                                    prefix="₱"
                                    placeholder="0.00"
                                    value={platformFees}
                                    onChange={(e) => setPlatformFees(e.target.value)}
                                />
                                <Hint>Commission, shipping & service fees</Hint>
                            </FormItem>
                        </div>
                        <FormItem label="Remarks" className="mb-0">
                            <Input
                                textArea
                                rows={2}
                                placeholder="Notes for the approver"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                            />
                        </FormItem>
                    </Section>
                </div>

                {/* Summary */}
                <aside className="lg:col-span-4">
                    <div className="space-y-4 lg:sticky lg:top-0">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-3 flex items-center justify-between">
                                <h5 className="text-sm font-semibold heading-text">Transaction summary</h5>
                                {previewing ? <Spinner size={16} /> : null}
                            </div>
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                {selectedSource ? (
                                    <SourceBadge source={selectedSource} />
                                ) : (
                                    <span className="italic">No channel selected</span>
                                )}
                                {orderRef.trim() ? <span>#{orderRef.trim()}</span> : null}
                                {ymd ? <span>{dayjs(ymd).format('MMM D, YYYY')}</span> : null}
                            </div>

                            {totals ? (
                                <>
                                    <SummaryRow label="Gross sales" value={totals.grossSales} />
                                    <SummaryRow label="Discounts" value={totals.discount} negative muted />
                                    <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
                                    <SummaryRow label="VATable sales" value={totals.taxableSales} muted />
                                    <SummaryRow label="VAT amount" value={totals.vatAmount} muted />
                                    <SummaryRow label="VAT-exempt sales" value={totals.exemptSales} muted />
                                    <SummaryRow label="Zero-rated sales" value={totals.zeroRatedSales} muted />
                                    {totals.nonTaxableSales > 0 ? (
                                        <SummaryRow label="No tax setup" value={totals.nonTaxableSales} muted />
                                    ) : null}
                                    <div className="my-2 border-t border-gray-200 dark:border-gray-700" />
                                    <SummaryRow label="Net of VAT" value={totals.netAmount} muted />
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-sm font-semibold heading-text">Total amount</span>
                                        <span className="text-xl font-bold tabular-nums heading-text">
                                            {money(totals.grandTotal)}
                                        </span>
                                    </div>
                                    <div className="mt-2 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-900/40">
                                        <SummaryRow label="Platform fees" value={totals.platformFees} negative muted />
                                        <SummaryRow label="Expected settlement" value={totals.netSettlement} strong />
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-lg border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400 dark:border-gray-700">
                                    {companyId
                                        ? 'Add a product with quantity and price to see the tax breakdown.'
                                        : 'Select a company and add products to see the tax breakdown.'}
                                </div>
                            )}
                        </div>

                        {totals && totals.nonTaxableSales > 0 ? (
                            <Alert type="warning" showIcon>
                                Some products have no tax setup, so no VAT was calculated for them. Set their tax classification and FICO tax code in MM Material Master.
                            </Alert>
                        ) : null}

                        <p className="px-1 text-[11px] leading-relaxed text-gray-400">
                            Tax comes from SD tax determination: each material&apos;s MM tax classification and the FICO rate in force on the transaction date. The channel never changes the tax.
                        </p>
                    </div>
                </aside>
            </div>
        </FormDialog>
    )
}
