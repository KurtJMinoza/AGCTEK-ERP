'use client'

import Image from 'next/image'
import {
    HiOutlineCube,
    HiOutlineChevronDown,
} from 'react-icons/hi'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import Switcher from '@/components/ui/Switcher'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import {
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'
import type {
    CatalogVariantsSummary,
    SdProductRecord,
} from '../services/productCatalogService'
import type { CatalogStockSnapshot } from '../utils/productCatalogTableColors'
import {
    badgeTextClass,
    categoryTextClass,
    priceTextClass,
    stockBarClass,
    stockDetail,
    stockLabel,
    stockPercent,
    stockTextClass,
    visibilityTextClass,
} from '../utils/productCatalogTableColors'

export const pcTableRowEnterClass = wmTableRowEnterClass

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
        value,
    )

export function PcProductThumbnail({
    src,
    alt,
}: {
    src: string
    alt: string
}) {
    return (
        <div
            className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 ring-1 ring-transparent transition-shadow duration-200 group-hover/row:ring-primary/20 dark:border-gray-700 dark:bg-gray-800 sm:h-11 sm:w-11 ${wmIconPopClass(60)}`}
        >
            {isRenderableImageSrc(src) ? (
                <Image
                    src={src}
                    alt={alt}
                    fill
                    sizes="44px"
                    unoptimized={isUnoptimizedImage(src)}
                    className="object-cover transition-transform duration-200 group-hover/row:scale-105"
                />
            ) : (
                <HiOutlineCube className="m-auto h-full w-5 text-gray-400" />
            )}
        </div>
    )
}

export function PcCompanyLogo({
    company,
}: {
    company: { name: string; logoUrl: string | null }
}) {
    const src = company.logoUrl?.trim() ?? ''
    return (
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700">
            {isRenderableImageSrc(src) ? (
                <Image
                    src={src}
                    alt=""
                    fill
                    sizes="32px"
                    unoptimized={isUnoptimizedImage(src)}
                    className="object-contain p-0.5"
                />
            ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-gray-400">
                    {(company.name ?? '').slice(0, 2) || '?'}
                </span>
            )}
        </div>
    )
}

type PcProductIdentityCellProps = {
    product: SdProductRecord
    stockSnapshot?: CatalogStockSnapshot
    variantsSummary?: CatalogVariantsSummary
}

export function PcProductIdentityCell({
    product,
    stockSnapshot,
    variantsSummary,
}: PcProductIdentityCellProps) {
    const stockLine =
        variantsSummary && variantsSummary.variantCount > 0
            ? `${variantsSummary.availableQty} avail · ${variantsSummary.variantCount} var`
            : stockSnapshot
              ? stockLabel(stockSnapshot)
              : null

    return (
        <div className="flex min-w-0 items-start gap-2.5 py-0.5 sm:gap-3">
            <PcProductThumbnail src={product.imageUrl} alt={product.name} />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {product.name}
                    </p>
                    {product.badge ? (
                        <Tag
                            className={`hidden shrink-0 lg:inline-flex ${badgeTextClass()}`}
                        >
                            {product.badge}
                        </Tag>
                    ) : null}
                </div>
                <p className="truncate font-mono text-[11px] text-gray-500">
                    {product.sku}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] md:hidden">
                    <span className={`font-semibold ${priceTextClass(product)}`}>
                        {formatPrice(product.price)}
                    </span>
                    {stockLine ? (
                        <span className="text-gray-500">{stockLine}</span>
                    ) : null}
                    <span
                        className={
                            product.isActive
                                ? 'text-emerald-600'
                                : 'text-gray-400'
                        }
                    >
                        {product.isActive ? 'Live' : 'Hidden'}
                    </span>
                </div>
            </div>
        </div>
    )
}

export function PcCompanyCell({ product }: { product: SdProductRecord }) {
    const company = product.company
    if (!company) {
        return (
            <span className="text-sm text-gray-400">Not linked to MM</span>
        )
    }
    return (
        <div className="flex min-w-0 items-center gap-2">
            <PcCompanyLogo company={company} />
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {company.name}
                </p>
                <p className="truncate font-mono text-[11px] text-gray-500">
                    {company.code}
                </p>
            </div>
        </div>
    )
}

export function PcCategoryCell({ category }: { category: string }) {
    return (
        <span
            className={`truncate text-sm font-medium ${categoryTextClass(category)}`}
        >
            {category}
        </span>
    )
}

export function PcPriceCell({ product }: { product: SdProductRecord }) {
    return (
        <div className="min-w-0">
            <p className={`truncate text-sm font-semibold ${priceTextClass(product)}`}>
                {formatPrice(product.price)}
            </p>
            {product.originalPrice !== null ? (
                <p className="truncate text-[11px] text-gray-400 line-through">
                    {formatPrice(product.originalPrice)}
                </p>
            ) : null}
        </div>
    )
}

export function PcStockCell({
    stockSnapshot,
    variantsSummary,
}: {
    stockSnapshot?: CatalogStockSnapshot
    variantsSummary?: CatalogVariantsSummary
}) {
    const summary = variantsSummary
    if (summary && summary.variantCount > 0) {
        return (
            <div className="min-w-0 max-w-[11rem]">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {summary.availableQty} available
                </p>
                <p className="truncate text-[11px] text-gray-500">
                    {summary.variantCount} variant
                    {summary.variantCount === 1 ? '' : 's'} · On hand{' '}
                    {summary.onHandQty} · Rsv {summary.reservedQty}
                </p>
            </div>
        )
    }
    const label = stockLabel(stockSnapshot)
    const detail = stockDetail(stockSnapshot)
    const state = stockSnapshot?.state ?? 'NOT_MAPPED'
    return (
        <div className="min-w-0 max-w-[11rem]">
            <p
                className={`mb-1 truncate text-sm font-semibold ${stockTextClass(state)}`}
                title={stockSnapshot?.error}
            >
                {label}
            </p>
            {detail ? (
                <p className="mb-1 truncate text-[11px] text-gray-500">{detail}</p>
            ) : null}
            <Progress
                percent={stockPercent(stockSnapshot)}
                showInfo={false}
                customColorClass={stockBarClass(state)}
            />
        </div>
    )
}

export function PcBadgeCell({ badge }: { badge: string | null }) {
    if (!badge) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <Tag className={`max-w-full truncate ${badgeTextClass()}`}>{badge}</Tag>
    )
}

export function PcVisibilityCell({
    active,
    toggling,
    canUpdate,
    onToggle,
}: {
    active: boolean
    toggling: boolean
    canUpdate: boolean
    onToggle: (checked: boolean) => void
}) {
    const percent = active ? 100 : 18
    return (
        <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 flex-1 max-w-[9rem] xl:block">
                <p
                    className={`mb-1 truncate text-sm font-medium ${visibilityTextClass(active)}`}
                >
                    {active ? 'Storefront live' : 'Hidden'}
                </p>
                <Progress
                    percent={percent}
                    showInfo={false}
                    customColorClass={active ? 'bg-emerald-500' : 'bg-rose-400'}
                />
            </div>
            <Switcher
                checked={active}
                isLoading={toggling}
                disabled={!canUpdate}
                onChange={onToggle}
            />
        </div>
    )
}

export function PcVariantsCell({
    count,
    expandable,
}: {
    count: number
    expandable?: boolean
}) {
    if (count <= 0) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <span className="inline-flex min-w-0 items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
            <span className="truncate">
                {count} variant{count === 1 ? '' : 's'}
            </span>
            {expandable ? (
                <HiOutlineChevronDown className="shrink-0 text-xs text-gray-400 transition-transform duration-200 group-hover/row:translate-y-0.5" />
            ) : null}
        </span>
    )
}
