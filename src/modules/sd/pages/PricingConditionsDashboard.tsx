'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTag,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
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
import {
    createPricingCondition,
    expirePricingCondition,
    listPricing,
    updateBasePrice,
    updatePricingCondition,
    type PricingCustomerType,
    type PricingRecord,
    type PricingStatus,
    type PricingSummary,
    type PricingTab,
} from '../services/pricingConditionService'

const ROUTE_PATH = '/modules/sd/pricing-conditions'
const SEARCH_DEBOUNCE_MS = 350
const ALL_PRODUCTS = ''

const TABS: { value: PricingTab; label: string }[] = [
    { value: 'BASE_PRICE', label: 'Base Price List' },
    { value: 'TIER_DISCOUNT', label: 'Volume & Tier Discounts' },
    { value: 'PROMO', label: 'Promos & Campaigns' },
]

const STATUS_META: Record<PricingStatus, { label: string; tone: StatusTone }> =
    {
        ACTIVE: { label: 'Active', tone: 'success' },
        SCHEDULED: { label: 'Scheduled', tone: 'info' },
        EXPIRED: { label: 'Expired', tone: 'default' },
        INACTIVE: { label: 'Inactive', tone: 'warning' },
    }

const CUSTOMER_LABEL: Record<PricingCustomerType, string> = {
    ALL: 'All customers',
    RETAIL: 'Retail',
    B2B: 'B2B / Wholesale',
}

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
    Object.keys(CUSTOMER_LABEL) as PricingCustomerType[]
).map((value) => ({ value, label: CUSTOMER_LABEL[value] }))

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const formatPhp = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(amount)

const formatDate = (value: string | null) =>
    value
        ? new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium' })
        : '—'

const formatValue = (record: PricingRecord) =>
    record.valueType === 'PERCENT_OFF'
        ? `-${record.value}%`
        : formatPhp(record.value)

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

const StatCard = ({
    label,
    value,
    active,
    onClick,
}: {
    label: string
    value: number | string
    active: boolean
    onClick: () => void
}) => (
    <Card
        clickable
        className={active ? 'ring-2 ring-primary' : undefined}
        onClick={onClick}
    >
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
    </Card>
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

    const columns = useMemo<ColumnDef<PricingRecord>[]>(
        () => [
            {
                header: 'Condition Code',
                id: 'conditionCode',
                cell: ({ row }) => (
                    <span className="font-mono font-semibold">
                        {row.original.conditionCode}
                    </span>
                ),
            },
            {
                header: 'Condition Name',
                id: 'name',
                cell: ({ row }) => {
                    const r = row.original
                    const detail = [
                        r.kind === 'TIER_DISCOUNT' && r.minQuantity
                            ? `${r.minQuantity}+ items`
                            : null,
                        r.kind !== 'BASE_PRICE' && r.customerType !== 'ALL'
                            ? CUSTOMER_LABEL[r.customerType]
                            : null,
                        r.promoCode ? `Code ${r.promoCode}` : null,
                    ].filter(Boolean)
                    return (
                        <div className="min-w-[10rem]">
                            <div className="font-semibold">{r.name}</div>
                            {detail.length ? (
                                <div className="text-xs text-gray-500">
                                    {detail.join(' · ')}
                                </div>
                            ) : null}
                        </div>
                    )
                },
            },
            {
                header: 'Target SKU / Product',
                id: 'product',
                cell: ({ row }) =>
                    row.original.productId ? (
                        <div className="min-w-[10rem]">
                            <div className="font-mono text-xs text-gray-500">
                                {row.original.sku}
                            </div>
                            <div>{row.original.productName}</div>
                        </div>
                    ) : (
                        <span className="text-gray-500">All products</span>
                    ),
            },
            {
                header: 'Value',
                id: 'value',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.valueType === 'PERCENT_OFF'
                                ? 'whitespace-nowrap font-semibold text-emerald-600'
                                : 'whitespace-nowrap font-semibold'
                        }
                    >
                        {formatValue(row.original)}
                    </span>
                ),
            },
            {
                header: 'Valid From / To',
                id: 'validity',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm">
                        {formatDate(row.original.validFrom)} –{' '}
                        {row.original.validTo
                            ? formatDate(row.original.validTo)
                            : 'No end'}
                    </span>
                ),
            },
            {
                header: 'Status',
                id: 'status',
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_META[row.original.status].tone}>
                        {STATUS_META[row.original.status].label}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => {
                    const r = row.original
                    if (!canUpdate) return null
                    return (
                        <div className="flex justify-end gap-2">
                            {r.status !== 'EXPIRED' ? (
                                <Button size="xs" onClick={() => openEdit(r)}>
                                    Edit
                                </Button>
                            ) : null}
                            {r.kind !== 'BASE_PRICE' &&
                            r.status !== 'EXPIRED' ? (
                                <Button
                                    size="xs"
                                    loading={expiringId === r.id}
                                    onClick={() => void expire(r)}
                                >
                                    End now
                                </Button>
                            ) : null}
                        </div>
                    )
                },
            },
        ],
        [canUpdate, expiringId, expire, openEdit],
    )

    const isBase = form.recordType === 'BASE_PRICE'

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Pricing Conditions & Rules"
                description="Define base prices, quantity tier discounts, and promo overrides."
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

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard
                    label="Total Base Prices"
                    value={summary?.basePrices ?? 0}
                    active={tab === 'BASE_PRICE'}
                    onClick={() => selectTab('BASE_PRICE')}
                />
                <StatCard
                    label="Active Tier Discounts"
                    value={summary?.activeTierDiscounts ?? 0}
                    active={tab === 'TIER_DISCOUNT'}
                    onClick={() => selectTab('TIER_DISCOUNT')}
                />
                <StatCard
                    label="Active Promos"
                    value={summary?.activePromos ?? 0}
                    active={tab === 'PROMO'}
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
                        placeholder="Search SKU, product name or condition code..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    {tab !== 'BASE_PRICE' ? (
                        <p className="text-xs text-gray-500">
                            Saved as pricing records. Checkout, POS and
                            quotations still charge the base price.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-500">
                            PR00 is the Product Catalog selling price.
                        </p>
                    )}
                </div>

                <SdDataTable
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
                icon={<HiOutlineTag />}
                title={
                    editing
                        ? `Edit ${editing.conditionCode}`
                        : 'Add Price Record'
                }
                description={
                    isBase
                        ? 'Sets the selling price in the Product Catalog (PR00).'
                        : 'Quantity tier or promo pricing record.'
                }
                size="lg"
                onSubmit={save}
                confirmText="Save"
                confirmLoading={saving}
            >
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem label="Record type" className="md:col-span-2">
                        <Select<Option<PricingTab>>
                            isSearchable={false}
                            isDisabled={Boolean(editing)}
                            options={RECORD_TYPE_OPTIONS}
                            value={RECORD_TYPE_OPTIONS.find(
                                (o) => o.value === form.recordType,
                            )}
                            onChange={(o) => o && changeRecordType(o.value)}
                        />
                    </FormItem>

                    <FormItem
                        label={isBase ? 'Product' : 'Target product'}
                        className="md:col-span-2"
                    >
                        <Select<Option<string>>
                            isDisabled={isBase && Boolean(editing)}
                            placeholder="Search SKU or product..."
                            options={productOptions}
                            value={
                                productOptions.find(
                                    (o) => o.value === form.productId,
                                ) ?? null
                            }
                            onChange={(o) =>
                                setField('productId', o?.value ?? ALL_PRODUCTS)
                            }
                        />
                    </FormItem>

                    {!isBase ? (
                        <>
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
                                            setField(
                                                'minQuantity',
                                                e.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                            ) : (
                                <FormItem label="Promo code (optional)">
                                    <Input
                                        placeholder="SALE1111"
                                        value={form.promoCode}
                                        onChange={(e) =>
                                            setField(
                                                'promoCode',
                                                e.target.value,
                                            )
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
                        </>
                    ) : null}

                    <FormItem
                        label={
                            isBase
                                ? 'Selling price (₱)'
                                : form.valueType === 'PERCENT_OFF'
                                  ? 'Percent off (%)'
                                  : 'Promo price (₱)'
                        }
                    >
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.value}
                            onChange={(e) => setField('value', e.target.value)}
                        />
                    </FormItem>

                    {!isBase ? (
                        <>
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
                        </>
                    ) : null}
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default PricingConditionsDashboard
