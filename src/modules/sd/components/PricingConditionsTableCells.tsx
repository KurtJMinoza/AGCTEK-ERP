'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import {
    HiOutlineArrowRight,
    HiOutlineCalendar,
    HiOutlineCube,
    HiOutlineCurrencyDollar,
    HiOutlineGift,
    HiOutlineTag,
    HiOutlineTrendingDown,
    HiOutlineTrendingUp,
    HiOutlineUsers,
} from 'react-icons/hi'
import Tag from '@/components/ui/Tag'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import { formatSdDate, formatSdMoney } from './SdDataTableCells'
import { wmIconPopClass } from '@/modules/mm/warehouse/components/WarehouseTableCells'
import type {
    PricingCustomerType,
    PricingRecord,
    PricingStatus,
    PricingTab,
} from '../services/pricingConditionService'

export const PRICING_STATUS_META: Record<
    PricingStatus,
    { label: string; tone: StatusTone }
> = {
    ACTIVE: { label: 'Active', tone: 'success' },
    SCHEDULED: { label: 'Scheduled', tone: 'info' },
    EXPIRED: { label: 'Expired', tone: 'default' },
    INACTIVE: { label: 'Inactive', tone: 'warning' },
}

export const PRICING_CUSTOMER_LABEL: Record<PricingCustomerType, string> = {
    ALL: 'All customers',
    RETAIL: 'Retail',
    B2B: 'B2B / Wholesale',
}

const KIND_META: Record<
    PricingTab,
    { label: string; Icon: typeof HiOutlineTag; tile: string }
> = {
    BASE_PRICE: {
        label: 'Base price',
        Icon: HiOutlineCurrencyDollar,
        tile: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    },
    TIER_DISCOUNT: {
        label: 'Volume tier',
        Icon: HiOutlineTag,
        tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    },
    PROMO: {
        label: 'Promo',
        Icon: HiOutlineGift,
        tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    },
}

/** Condition code + name with kind icon (Customer Master / SO doc-cell style). */
export function PricingConditionIdentityCell({
    record,
}: {
    record: PricingRecord
}) {
    const meta = KIND_META[record.kind]
    const Icon = meta.Icon
    return (
        <div className="flex min-w-0 items-start gap-2.5 py-0.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tile} ${wmIconPopClass(70)}`}
            >
                <Icon className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-primary">
                    {record.conditionCode}
                </p>
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {record.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-gray-500 sm:hidden">
                    {meta.label}
                    {record.promoCode ? ` · ${record.promoCode}` : ''}
                </p>
            </div>
        </div>
    )
}

/** Target product (or all products). */
export function PricingProductCell({ record }: { record: PricingRecord }) {
    if (!record.productId) {
        return (
            <div className="flex min-w-0 items-center gap-2 py-0.5">
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 ${wmIconPopClass(90)}`}
                >
                    <HiOutlineCube className="text-base" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        All products
                    </p>
                    <p className="text-[11px] text-gray-500">Catalog-wide rule</p>
                </div>
            </div>
        )
    }
    return (
        <div className="flex min-w-0 items-start gap-2 py-0.5">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${wmIconPopClass(90)}`}
            >
                <HiOutlineCube className="text-base" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {record.productName ?? '—'}
                </p>
                <p className="truncate font-mono text-[11px] text-gray-500">
                    {record.sku ?? '—'}
                </p>
            </div>
        </div>
    )
}

/** Percent chip or money amount. */
export function PricingValueCell({ record }: { record: PricingRecord }) {
    if (record.valueType === 'PERCENT_OFF') {
        return (
            <div className="min-w-0 whitespace-nowrap">
                <Tag className="border-0 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    −{record.value}%
                </Tag>
                <p className="mt-1 text-[11px] text-gray-500">Percent off</p>
            </div>
        )
    }
    if (record.valueType === 'FIXED_PRICE') {
        return (
            <div className="min-w-0 whitespace-nowrap">
                <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatSdMoney(record.value)}
                </p>
                <p className="text-[11px] text-gray-500">Fixed price</p>
            </div>
        )
    }
    return (
        <div className="min-w-0 whitespace-nowrap">
            <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatSdMoney(record.value)}
            </p>
            <p className="text-[11px] text-gray-500">Catalog PR00</p>
        </div>
    )
}

/** Min qty / customer / promo chips. */
export function PricingScopeCell({ record }: { record: PricingRecord }) {
    if (record.kind === 'BASE_PRICE') {
        return <span className="text-sm text-gray-400">—</span>
    }
    const chips: ReactNode[] = []
    if (record.kind === 'TIER_DISCOUNT' && record.minQuantity != null) {
        chips.push(
            <Tag
                key="qty"
                className="border-0 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
            >
                {record.minQuantity}+ units
            </Tag>,
        )
    }
    if (record.customerType !== 'ALL') {
        chips.push(
            <Tag
                key="cust"
                className="inline-flex items-center gap-1 border-0 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
            >
                <HiOutlineUsers className="text-xs" />
                {PRICING_CUSTOMER_LABEL[record.customerType]}
            </Tag>,
        )
    } else {
        chips.push(
            <Tag
                key="cust-all"
                className="border-0 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
                All customers
            </Tag>,
        )
    }
    if (record.promoCode) {
        chips.push(
            <Tag
                key="promo"
                className="border-0 bg-amber-50 font-mono text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
                {record.promoCode}
            </Tag>,
        )
    }
    return (
        <div className="flex max-w-[14rem] flex-wrap gap-1.5 py-0.5">{chips}</div>
    )
}

/** Validity window with calendar icon. */
export function PricingValidityCell({ record }: { record: PricingRecord }) {
    if (record.kind === 'BASE_PRICE') {
        const updated = formatSdDate(record.validFrom)
        return (
            <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                <HiOutlineCalendar className="shrink-0 text-base text-gray-400" />
                <span>Updated {updated ?? '—'}</span>
            </div>
        )
    }
    const from = formatSdDate(record.validFrom) ?? '—'
    const to = record.validTo ? formatSdDate(record.validTo) : 'No end'
    return (
        <div className="min-w-0 py-0.5">
            <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <HiOutlineCalendar className="shrink-0 text-base text-gray-400" />
                <span className="whitespace-nowrap">{from}</span>
            </div>
            <p className="mt-0.5 pl-6 text-[11px] text-gray-500">to {to}</p>
        </div>
    )
}

export function PricingStatusCell({ status }: { status: PricingStatus }) {
    const meta = PRICING_STATUS_META[status]
    return (
        <StatusBadge tone={meta.tone} className="max-w-full truncate">
            {meta.label}
        </StatusBadge>
    )
}

/** Product hero used inside the PR00 / condition form dialog. */
export function PricingProductHero({
    sku,
    name,
    imageUrl,
    currentPrice,
    badge = 'PR00',
}: {
    sku: string
    name: string
    imageUrl?: string | null
    currentPrice?: number | null
    badge?: string
}) {
    const src = imageUrl?.trim() ?? ''
    return (
        <div className="animate-mm-row-in motion-reduce:animate-none overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-700 dark:from-gray-900 dark:to-gray-950">
            <div className="flex items-start gap-3 p-4 sm:gap-4">
                <div
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 sm:h-20 sm:w-20 ${wmIconPopClass(40)}`}
                >
                    {isRenderableImageSrc(src) ? (
                        <Image
                            src={src}
                            alt={name}
                            fill
                            sizes="80px"
                            unoptimized={isUnoptimizedImage(src)}
                            className="object-cover"
                        />
                    ) : (
                        <HiOutlineCube className="m-auto h-full w-7 text-gray-400" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Tag className="border-0 bg-sky-50 font-mono text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                            {badge}
                        </Tag>
                        <span className="font-mono text-[11px] text-gray-500">
                            {sku}
                        </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100 sm:text-base">
                        {name}
                    </p>
                    {currentPrice != null ? (
                        <p className="mt-2 text-xs text-gray-500">
                            Current catalog price{' '}
                            <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                {formatSdMoney(currentPrice)}
                            </span>
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

/** Large PR00 selling-price editor with live delta vs current catalog price. */
export function PricingBasePriceEditor({
    value,
    currentPrice,
    onChange,
}: {
    value: string
    currentPrice: number | null
    onChange: (next: string) => void
}) {
    const next = Number(value)
    const hasNext = Number.isFinite(next) && value.trim() !== ''
    const delta =
        hasNext && currentPrice != null
            ? Math.round((next - currentPrice) * 100) / 100
            : null

    return (
        <div className="animate-mm-row-in motion-reduce:animate-none [animation-delay:80ms] space-y-3 rounded-xl border border-primary/20 bg-primary-subtle/40 p-4 dark:bg-primary/10">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-deep dark:text-primary-light">
                        Selling price (₱)
                    </p>
                    <p className="text-[11px] text-gray-500">
                        Updates Product Catalog PR00 immediately on save
                    </p>
                </div>
                <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white text-primary shadow-sm dark:bg-gray-900 ${wmIconPopClass(100)}`}
                >
                    <HiOutlineCurrencyDollar className="text-lg" />
                </span>
            </div>

            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-gray-400">
                    ₱
                </span>
                <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-8 pr-3 text-2xl font-bold tabular-nums text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    placeholder="0.00"
                />
            </div>

            {currentPrice != null && hasNext ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="tabular-nums text-gray-500">
                        {formatSdMoney(currentPrice)}
                    </span>
                    <HiOutlineArrowRight className="text-gray-400" />
                    <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {formatSdMoney(next)}
                    </span>
                    {delta != null && delta !== 0 ? (
                        <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                delta > 0
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                        >
                            {delta > 0 ? (
                                <HiOutlineTrendingUp />
                            ) : (
                                <HiOutlineTrendingDown />
                            )}
                            {delta > 0 ? '+' : ''}
                            {formatSdMoney(delta)}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400">No change</span>
                    )}
                </div>
            ) : null}
        </div>
    )
}
