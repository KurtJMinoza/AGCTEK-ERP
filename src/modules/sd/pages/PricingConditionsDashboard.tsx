'use client'

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import {
    HiOutlineCurrencyDollar,
    HiOutlineGift,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineStop,
    HiOutlineTag,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { type ColumnDef } from '@/components/shared/DataTable'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FormDialog from '@/components/shared/FormDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Alert from '@/components/ui/Alert'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { sdParentBreadcrumbs } from '../utils/sdPageUi'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import {
    listProducts,
    type SdProductRecord,
} from '../services/productCatalogService'
import SdDataTable from '../components/SdDataTable'
import {
    PricingBasePriceEditor,
    PricingConditionIdentityCell,
    PricingProductCell,
    PricingProductHero,
    PricingScopeCell,
    PricingStatusCell,
    PricingValidityCell,
    PricingValueCell,
    PRICING_CUSTOMER_LABEL,
} from '../components/PricingConditionsTableCells'
import {
    createPricingCondition,
    expirePricingCondition,
    listPricing,
    updateBasePrice,
    updatePricingCondition,
    type PricingCustomerType,
    type PricingRecord,
    type PricingSummary,
    type PricingTab,
} from '../services/pricingConditionService'
import { formatSdMoney } from '../components/SdDataTableCells'

const ROUTE_PATH = '/modules/sd/pricing-conditions'
const SEARCH_DEBOUNCE_MS = 350
const ALL_PRODUCTS = ''

const TABS: { value: PricingTab; label: string }[] = [
    { value: 'BASE_PRICE', label: 'Base Price List' },
    { value: 'TIER_DISCOUNT', label: 'Volume & Tier Discounts' },
    { value: 'PROMO', label: 'Promos & Campaigns' },
]

type Option<T extends string> = { value: T; label: string }

const RECORD_TYPE_OPTIONS: Option<PricingTab>[] = [
    { value: 'BASE_PRICE', label: 'Base price (Product Catalog)' },
    { value: 'TIER_DISCOUNT', label: 'Volume / tier discount' },
    { value: 'PROMO', label: 'Promo / campaign' },
]

const VALUE_TYPE_OPTIONS: Option<'PERCENT_OFF' | 'FIXED_PRICE'>[] = [
    { value: 'PERCENT_OFF', label: 'Percent off (%)' },
    { value: 'FIXED_PRICE', label: 'Fixed price (₱)' },
]

const CUSTOMER_OPTIONS: Option<PricingCustomerType>[] = (
    Object.keys(PRICING_CUSTOMER_LABEL) as PricingCustomerType[]
).map((value) => ({ value, label: PRICING_CUSTOMER_LABEL[value] }))

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : '')
const todayInput = () => new Date().toISOString().slice(0, 10)

type FormState = {
    recordType: PricingTab
    productId: string
    name: string
    conditionCode: string
    minQuantity: string
    customerType: PricingCustomerType
    valueType: 'PERCENT_OFF' | 'FIXED_PRICE'
    value: string
    promoCode: string
    validFrom: string
    validTo: string
}

const emptyForm = (recordType: PricingTab): FormState => ({
    recordType,
    productId: ALL_PRODUCTS,
    name: '',
    conditionCode: '',
    minQuantity: recordType === 'TIER_DISCOUNT' ? '10' : '',
    customerType: recordType === 'TIER_DISCOUNT' ? 'B2B' : 'ALL',
    valueType: 'PERCENT_OFF',
    value: '',
    promoCode: '',
    validFrom: todayInput(),
    validTo: '',
})

const formFromRecord = (record: PricingRecord): FormState => ({
    recordType: record.kind,
    productId: record.productId ?? ALL_PRODUCTS,
    name: record.name,
    conditionCode: record.conditionCode,
    minQuantity: record.minQuantity?.toString() ?? '',
    customerType: record.customerType,
    valueType:
        record.valueType === 'FIXED_PRICE' ? 'FIXED_PRICE' : 'PERCENT_OFF',
    value: record.value.toString(),
    promoCode: record.promoCode ?? '',
    validFrom: toDateInput(record.validFrom),
    validTo: toDateInput(record.validTo),
})

const SummaryStat = ({
    label,
    value,
    hint,
    active,
    icon,
    delayMs,
    onClick,
}: {
    label: string
    value: number | string
    hint: string
    active: boolean
    icon: ReactNode
    delayMs: number
    onClick: () => void
}) => (
    <AdaptiveCard
        clickable
        className={[
            'transition-all duration-200',
            'animate-mm-row-in motion-reduce:animate-none',
            delayMs ? `[animation-delay:${delayMs}ms]` : '',
            active
                ? 'ring-2 ring-primary shadow-md'
                : 'hover:-translate-y-0.5 hover:shadow-md',
        ]
            .filter(Boolean)
            .join(' ')}
        onClick={onClick}
    >
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {label}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {value}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">{hint}</div>
            </div>
            <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light animate-mm-icon-pop motion-reduce:animate-none ${delayMs ? `[animation-delay:${delayMs + 80}ms]` : ''}`}
            >
                {icon}
            </span>
        </div>
    </AdaptiveCard>
)

const PricingConditionsDashboard = () => {
    const parentBreadcrumbs = useMemo(
        () => sdParentBreadcrumbs(ROUTE_PATH),
        [],
    )
    const { canCreate, canUpdate } = useResourceAccess('sd.pricing-conditions')

    const [tab, setTab] = useState<PricingTab>('BASE_PRICE')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<PricingRecord[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] = useState<PricingSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<PricingRecord | null>(null)
    const [form, setForm] = useState<FormState>(() => emptyForm('BASE_PRICE'))
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [products, setProducts] = useState<SdProductRecord[]>([])
    const [expiringId, setExpiringId] = useState<string | null>(null)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const result = await listPricing({ tab, search, page, pageSize })
            setRows(result.data)
            setTotal(result.total)
            setSummary(result.summary)
            setError(null)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to load pricing conditions',
            )
        } finally {
            setLoading(false)
        }
    }, [tab, search, page, pageSize])

    useEffect(() => {
        void fetchList()
    }, [fetchList])

    useEffect(() => {
        if (searchInput.trim() === search) return
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, SEARCH_DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [searchInput, search])

    const selectTab = (next: PricingTab) => {
        setTab(next)
        setPage(1)
    }

    const ensureProducts = useCallback(async () => {
        if (products.length) return
        try {
            setProducts(await listProducts())
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Unable to load products',
            )
        }
    }, [products.length])

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm(tab))
        setFormError(null)
        setDialogOpen(true)
        void ensureProducts()
    }

    const openEdit = useCallback(
        (record: PricingRecord) => {
            setEditing(record)
            setForm(formFromRecord(record))
            setFormError(null)
            setDialogOpen(true)
            void ensureProducts()
        },
        [ensureProducts],
    )

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }))

    const changeRecordType = (recordType: PricingTab) =>
        setForm((prev) => ({
            ...emptyForm(recordType),
            productId: prev.productId,
        }))

    const productOptions = useMemo<Option<string>[]>(
        () => [
            ...(form.recordType === 'BASE_PRICE'
                ? []
                : [{ value: ALL_PRODUCTS, label: 'All products' }]),
            ...products.map((p) => ({
                value: p.id,
                label: `${p.sku} — ${p.name}`,
            })),
        ],
        [products, form.recordType],
    )

    const selectedProduct = useMemo(() => {
        if (!form.productId) return null
        return products.find((p) => p.id === form.productId) ?? null
    }, [form.productId, products])

    const baseCurrentPrice = useMemo(() => {
        if (form.recordType !== 'BASE_PRICE') return null
        if (selectedProduct) return selectedProduct.price
        if (editing?.kind === 'BASE_PRICE') return editing.value
        return null
    }, [editing, form.recordType, selectedProduct])

    const preview = useMemo(() => {
        if (
            form.recordType === 'BASE_PRICE' ||
            form.valueType !== 'PERCENT_OFF' ||
            !selectedProduct
        ) {
            return null
        }
        const percent = Number(form.value)
        if (!Number.isFinite(percent) || percent <= 0) return null
        const discounted =
            Math.round(selectedProduct.price * (1 - percent / 100) * 100) / 100
        return { base: selectedProduct.price, discounted }
    }, [form.recordType, form.value, form.valueType, selectedProduct])

    const save = async () => {
        setFormError(null)
        const value = Number(form.value)
        if (!form.value || !Number.isFinite(value) || value < 0) {
            setFormError('Enter a valid value')
            return
        }
        setSaving(true)
        try {
            if (form.recordType === 'BASE_PRICE') {
                if (!form.productId)
                    throw new Error('Choose the product to price')
                await updateBasePrice(form.productId, value)
            } else {
                if (!form.name.trim()) throw new Error('Enter a condition name')
                const payload = {
                    name: form.name.trim(),
                    productId: form.productId || null,
                    minQuantity:
                        form.recordType === 'TIER_DISCOUNT' && form.minQuantity
                            ? Number(form.minQuantity)
                            : null,
                    customerType: form.customerType,
                    valueType: form.valueType,
                    value,
                    promoCode:
                        form.recordType === 'PROMO' && form.promoCode.trim()
                            ? form.promoCode.trim()
                            : null,
                    validFrom: new Date(
                        `${form.validFrom}T00:00:00`,
                    ).toISOString(),
                    validTo: form.validTo
                        ? new Date(`${form.validTo}T23:59:59`).toISOString()
                        : null,
                }
                if (editing) {
                    await updatePricingCondition(editing.id, payload)
                } else {
                    await createPricingCondition({
                        ...payload,
                        conditionType: form.recordType,
                        conditionCode:
                            form.conditionCode.trim().toUpperCase() ||
                            undefined,
                    })
                }
            }
            notify(
                'success',
                'Price record saved',
                form.recordType === 'BASE_PRICE'
                    ? 'The Product Catalog price was updated.'
                    : 'The pricing condition was saved.',
            )
            setDialogOpen(false)
            if (form.recordType !== tab) selectTab(form.recordType)
            else await fetchList()
        } catch (err) {
            setFormError(
                err instanceof Error
                    ? err.message
                    : 'Unable to save price record',
            )
        } finally {
            setSaving(false)
        }
    }

    const expire = useCallback(
        async (record: PricingRecord) => {
            setExpiringId(record.id)
            try {
                await expirePricingCondition(record.id)
                notify(
                    'success',
                    'Condition ended',
                    `${record.conditionCode} is now expired.`,
                )
                await fetchList()
            } catch (err) {
                notify(
                    'danger',
                    'Could not end condition',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setExpiringId(null)
            }
        },
        [fetchList],
    )

    const columns = useMemo<ColumnDef<PricingRecord>[]>(() => {
        const base: ColumnDef<PricingRecord>[] = [
            {
                header: 'Condition',
                id: 'condition',
                size: 220,
                minSize: 180,
                cell: ({ row }) => (
                    <PricingConditionIdentityCell record={row.original} />
                ),
            },
            {
                header: tab === 'BASE_PRICE' ? 'Product' : 'Applies to',
                id: 'product',
                size: 200,
                minSize: 160,
                cell: ({ row }) => (
                    <PricingProductCell record={row.original} />
                ),
            },
            {
                header: tab === 'BASE_PRICE' ? 'Selling price' : 'Offer',
                id: 'value',
                size: 120,
                cell: ({ row }) => <PricingValueCell record={row.original} />,
            },
        ]

        if (tab !== 'BASE_PRICE') {
            base.push({
                header: 'Scope',
                id: 'scope',
                size: 180,
                meta: { className: 'hidden md:table-cell' },
                cell: ({ row }) => <PricingScopeCell record={row.original} />,
            })
        }

        base.push(
            {
                header: tab === 'BASE_PRICE' ? 'Last updated' : 'Validity',
                id: 'validity',
                size: 150,
                meta: { className: 'hidden sm:table-cell' },
                cell: ({ row }) => (
                    <PricingValidityCell record={row.original} />
                ),
            },
            {
                header: 'Status',
                id: 'status',
                size: 100,
                cell: ({ row }) => (
                    <PricingStatusCell status={row.original.status} />
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 140,
                cell: ({ row }) => {
                    const r = row.original
                    if (!canUpdate) return null
                    return (
                        <div className="flex justify-end gap-2">
                            {r.status !== 'EXPIRED' ? (
                                <Button
                                    size="xs"
                                    className="whitespace-nowrap"
                                    icon={<HiOutlinePencil />}
                                    onClick={() => openEdit(r)}
                                >
                                    Edit
                                </Button>
                            ) : null}
                            {r.kind !== 'BASE_PRICE' &&
                            r.status !== 'EXPIRED' ? (
                                <Button
                                    size="xs"
                                    className="whitespace-nowrap"
                                    icon={<HiOutlineStop />}
                                    loading={expiringId === r.id}
                                    onClick={() => void expire(r)}
                                >
                                    End
                                </Button>
                            ) : null}
                        </div>
                    )
                },
            },
        )

        return base
    }, [canUpdate, expire, expiringId, openEdit, tab])

    const isBase = form.recordType === 'BASE_PRICE'

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Pricing Conditions & Rules"
                description="Base catalog prices, volume tiers, and promo overrides used when SD resolves unit price."
                icon={<HiOutlineTag />}
                actions={
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={() => void fetchList()}
                        >
                            Refresh
                        </Button>
                        {canCreate || canUpdate ? (
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlinePlus />}
                                onClick={openCreate}
                            >
                                Add Price Record
                            </Button>
                        ) : null}
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <SummaryStat
                    label="Base prices"
                    value={summary?.basePrices ?? 0}
                    hint="PR00 catalog selling prices"
                    active={tab === 'BASE_PRICE'}
                    delayMs={0}
                    icon={<HiOutlineCurrencyDollar className="text-xl" />}
                    onClick={() => selectTab('BASE_PRICE')}
                />
                <SummaryStat
                    label="Active tier discounts"
                    value={summary?.activeTierDiscounts ?? 0}
                    hint="Quantity / volume rules in force"
                    active={tab === 'TIER_DISCOUNT'}
                    delayMs={60}
                    icon={<HiOutlineTag className="text-xl" />}
                    onClick={() => selectTab('TIER_DISCOUNT')}
                />
                <SummaryStat
                    label="Active promos"
                    value={summary?.activePromos ?? 0}
                    hint="Campaigns & promo codes in force"
                    active={tab === 'PROMO'}
                    delayMs={120}
                    icon={<HiOutlineGift className="text-xl" />}
                    onClick={() => selectTab('PROMO')}
                />
            </div>

            <Card>
                <Tabs
                    value={tab}
                    onChange={(value) => selectTab(value as PricingTab)}
                >
                    <Tabs.TabList>
                        {TABS.map((t) => (
                            <Tabs.TabNav key={t.value} value={t.value}>
                                {t.label}
                            </Tabs.TabNav>
                        ))}
                    </Tabs.TabList>
                </Tabs>

                <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Input
                        className="md:max-w-md"
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search SKU, product name or condition code…"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                        {tab === 'BASE_PRICE'
                            ? 'PR00 is the Product Catalog selling price.'
                            : 'Retail order create resolves active tiers/promos against catalog base.'}
                    </p>
                </div>

                <SdDataTable
                    key={`${tab}:${page}:${search}`}
                    columns={columns}
                    data={rows}
                    loading={loading && rows.length === 0}
                    noData={!loading && rows.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </Card>

            <FormDialog
                isOpen={dialogOpen}
                onClose={() => setDialogOpen(false)}
                icon={isBase ? <HiOutlineCurrencyDollar /> : <HiOutlineTag />}
                title={
                    editing
                        ? isBase
                            ? 'Edit base price (PR00)'
                            : `Edit ${editing.conditionCode}`
                        : isBase
                          ? 'Set base price (PR00)'
                          : 'Add Price Record'
                }
                description={
                    isBase
                        ? 'Change the Product Catalog selling price for this SKU.'
                        : 'Quantity tier or promo pricing record.'
                }
                size="lg"
                onSubmit={save}
                confirmText={isBase ? 'Save base price' : 'Save'}
                confirmLoading={saving}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}

                {isBase ? (
                    <div className="space-y-4">
                        {!editing ? (
                            <FormItem label="Product">
                                <Select<Option<string>>
                                    placeholder="Search SKU or product…"
                                    options={productOptions}
                                    value={
                                        productOptions.find(
                                            (o) => o.value === form.productId,
                                        ) ?? null
                                    }
                                    onChange={(o) =>
                                        setField(
                                            'productId',
                                            o?.value ?? ALL_PRODUCTS,
                                        )
                                    }
                                />
                            </FormItem>
                        ) : null}

                        {form.productId &&
                        (selectedProduct ||
                            (editing?.kind === 'BASE_PRICE' &&
                                editing.productId === form.productId)) ? (
                            <PricingProductHero
                                sku={
                                    selectedProduct?.sku ??
                                    editing?.sku ??
                                    '—'
                                }
                                name={
                                    selectedProduct?.name ??
                                    editing?.productName ??
                                    '—'
                                }
                                imageUrl={selectedProduct?.imageUrl}
                                currentPrice={baseCurrentPrice}
                                badge="PR00"
                            />
                        ) : (
                            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600">
                                Select a product to set its catalog selling
                                price.
                            </div>
                        )}

                        <PricingBasePriceEditor
                            value={form.value}
                            currentPrice={baseCurrentPrice}
                            onChange={(next) => setField('value', next)}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                        {!editing ? (
                            <FormItem
                                label="Record type"
                                className="md:col-span-2"
                            >
                                <Select<Option<PricingTab>>
                                    isSearchable={false}
                                    options={RECORD_TYPE_OPTIONS}
                                    value={RECORD_TYPE_OPTIONS.find(
                                        (o) => o.value === form.recordType,
                                    )}
                                    onChange={(o) =>
                                        o && changeRecordType(o.value)
                                    }
                                />
                            </FormItem>
                        ) : null}

                        <FormItem
                            label="Target product"
                            className="md:col-span-2"
                        >
                            <Select<Option<string>>
                                placeholder="Search SKU or product…"
                                options={productOptions}
                                value={
                                    productOptions.find(
                                        (o) => o.value === form.productId,
                                    ) ?? null
                                }
                                onChange={(o) =>
                                    setField(
                                        'productId',
                                        o?.value ?? ALL_PRODUCTS,
                                    )
                                }
                            />
                        </FormItem>

                        {selectedProduct ? (
                            <div className="md:col-span-2">
                                <PricingProductHero
                                    sku={selectedProduct.sku}
                                    name={selectedProduct.name}
                                    imageUrl={selectedProduct.imageUrl}
                                    currentPrice={selectedProduct.price}
                                    badge={
                                        form.recordType === 'PROMO'
                                            ? 'PROMO'
                                            : 'TIER'
                                    }
                                />
                            </div>
                        ) : null}

                        <FormItem label="Condition name">
                            <Input
                                placeholder={
                                    form.recordType === 'TIER_DISCOUNT'
                                        ? 'Wholesale 10+ Tier'
                                        : '11.11 Sale'
                                }
                                value={form.name}
                                onChange={(e) =>
                                    setField('name', e.target.value)
                                }
                            />
                        </FormItem>
                        <FormItem label="Condition code">
                            <Input
                                placeholder="Auto (DISC01 / PROMO01)"
                                disabled={Boolean(editing)}
                                value={form.conditionCode}
                                onChange={(e) =>
                                    setField(
                                        'conditionCode',
                                        e.target.value.toUpperCase(),
                                    )
                                }
                            />
                        </FormItem>
                        {form.recordType === 'TIER_DISCOUNT' ? (
                            <FormItem label="Minimum quantity">
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.minQuantity}
                                    onChange={(e) =>
                                        setField('minQuantity', e.target.value)
                                    }
                                />
                            </FormItem>
                        ) : (
                            <FormItem label="Promo code (optional)">
                                <Input
                                    placeholder="SALE1111"
                                    value={form.promoCode}
                                    onChange={(e) =>
                                        setField('promoCode', e.target.value)
                                    }
                                />
                            </FormItem>
                        )}
                        <FormItem label="Customers">
                            <Select<Option<PricingCustomerType>>
                                isSearchable={false}
                                options={CUSTOMER_OPTIONS}
                                value={CUSTOMER_OPTIONS.find(
                                    (o) => o.value === form.customerType,
                                )}
                                onChange={(o) =>
                                    o && setField('customerType', o.value)
                                }
                            />
                        </FormItem>
                        <FormItem label="Discount type">
                            <Select<Option<'PERCENT_OFF' | 'FIXED_PRICE'>>
                                isSearchable={false}
                                options={VALUE_TYPE_OPTIONS}
                                value={VALUE_TYPE_OPTIONS.find(
                                    (o) => o.value === form.valueType,
                                )}
                                onChange={(o) =>
                                    o && setField('valueType', o.value)
                                }
                            />
                        </FormItem>
                        <FormItem
                            label={
                                form.valueType === 'PERCENT_OFF'
                                    ? 'Percent off (%)'
                                    : 'Promo price (₱)'
                            }
                        >
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.value}
                                onChange={(e) =>
                                    setField('value', e.target.value)
                                }
                            />
                        </FormItem>
                        {preview ? (
                            <FormItem
                                label="Price preview"
                                className="md:col-span-2"
                            >
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                    <span className="text-gray-500">Base</span>
                                    <span className="font-medium tabular-nums">
                                        {formatSdMoney(preview.base)}
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                        {formatSdMoney(preview.discounted)}
                                    </span>
                                </div>
                            </FormItem>
                        ) : null}
                        <FormItem label="Valid from">
                            <Input
                                type="date"
                                value={form.validFrom}
                                onChange={(e) =>
                                    setField('validFrom', e.target.value)
                                }
                            />
                        </FormItem>
                        <FormItem label="Valid to (optional)">
                            <Input
                                type="date"
                                value={form.validTo}
                                onChange={(e) =>
                                    setField('validTo', e.target.value)
                                }
                            />
                        </FormItem>
                    </div>
                )}
            </FormDialog>
        </PageContainer>
    )
}

export default PricingConditionsDashboard
