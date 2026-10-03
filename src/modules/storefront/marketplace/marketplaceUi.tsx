'use client'

import Image from 'next/image'
import { HiOutlineMinus, HiOutlinePlus } from 'react-icons/hi'
import { Star } from 'lucide-react'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import { isUnoptimizedImage, productImageSrc } from '@/utils/productImage'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import { LPG_DIVISION_ID } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'

export const MARKETPLACE_NAME = 'AGC Marketplace'

/** Brand primary button colours, for ECME `customColorClass` props. */
export const PRIMARY_BUTTON = () =>
    'bg-emerald-600 hover:bg-emerald-700 text-white transition-colors'

export type DivisionTheme = {
    /** Soft tinted icon tile. */
    tile: string
    /** Filled tile for active / hovered states. */
    solid: string
    hoverSolid: string
    /** Card outline when the store or category is selected. */
    activeBorder: string
    /** Gentle card wash, used with `bg-gradient-to-br`. */
    wash: string
    text: string
}

const DIVISION_THEMES: Record<string, DivisionTheme> = {
    [RETAIL_DIVISION_ID]: {
        tile: 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-amber-200',
        solid: 'bg-emerald-600 text-amber-300',
        hoverSolid: 'group-hover:bg-emerald-600 group-hover:text-amber-300',
        activeBorder: '!border-amber-300',
        wash: 'from-emerald-50/80 via-white to-amber-50/70',
        text: 'text-emerald-700',
    },
    [APPLIANCES_DIVISION_ID]: {
        tile: 'bg-red-50 text-red-600',
        solid: 'bg-red-600 text-white',
        hoverSolid: 'group-hover:bg-red-600 group-hover:text-white',
        activeBorder: '!border-red-300',
        wash: 'from-red-50/80 to-white',
        text: 'text-red-600',
    },
    [LPG_DIVISION_ID]: {
        tile: 'bg-orange-50 text-orange-500',
        solid: 'bg-orange-500 text-white',
        hoverSolid: 'group-hover:bg-orange-500 group-hover:text-white',
        activeBorder: '!border-orange-300',
        wash: 'from-orange-50/80 to-white',
        text: 'text-orange-600',
    },
}

const DEFAULT_THEME: DivisionTheme = {
    tile: 'bg-emerald-50 text-emerald-600',
    solid: 'bg-emerald-600 text-white',
    hoverSolid: 'group-hover:bg-emerald-600 group-hover:text-white',
    activeBorder: '!border-emerald-300',
    wash: 'from-emerald-50/80 to-white',
    text: 'text-emerald-700',
}

export const divisionTheme = (divisionId: string | null) =>
    (divisionId && DIVISION_THEMES[divisionId]) || DEFAULT_THEME

/** Marketplace design tokens: white surfaces on gray-50, hairline borders, soft shadows. */
export const SURFACE = 'bg-white border border-gray-100 shadow-sm'
export const SURFACE_HOVER =
    'transition-all duration-200 hover:shadow-md hover:border-gray-200'
export const SECTION_TITLE =
    'text-2xl font-semibold tracking-tight text-gray-900'
export const SECTION_SUBTITLE = 'mt-1 text-sm text-gray-500'
/** Primary call-to-action, for ECME `Button` `className` + `customColorClass={PRIMARY_BUTTON}`. */
export const PRIMARY_BUTTON_CLASS =
    '!h-auto !rounded-lg border-0 px-4 py-2 text-sm font-medium'

/** SKUs are unique per division only, so cart lines are keyed by both. */
export const productKey = (
    product: Pick<SdProductRecord, 'divisionId' | 'sku'>,
) => `${product.divisionId}:${product.sku}`

export const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(value)

/** "Sold by AWIC" badge so shoppers know which division fulfils the item. */
export const SellerTag = ({
    divisionId,
    className,
    short,
}: {
    divisionId: string | null
    className?: string
    /** Store name only, e.g. in compact cart group headers. */
    short?: boolean
}) => (
    <StatusBadge
        className={classNames(
            'whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium',
            divisionTheme(divisionId).tile,
            className,
        )}
    >
        {short ? '' : 'Sold by '}
        {divisionId ? productDivisionLabel(divisionId) : 'Store'}
    </StatusBadge>
)

export const ProductImage = ({
    product,
    sizes,
    className,
    fit = 'cover',
}: {
    product: Pick<SdProductRecord, 'imageUrl' | 'name'>
    sizes: string
    className?: string
    /** `contain` shows the whole product on the soft grey tile. */
    fit?: 'cover' | 'contain'
}) => {
    const src = productImageSrc(product.imageUrl)
    return (
        <div
            className={classNames(
                'relative overflow-hidden bg-gray-50',
                className,
            )}
        >
            <Image
                src={src}
                alt={product.name}
                fill
                sizes={sizes}
                unoptimized={isUnoptimizedImage(src)}
                className={
                    fit === 'contain' ? 'object-contain' : 'object-cover'
                }
            />
        </div>
    )
}

/** Five-star row; `rating` is out of 5 (no review data yet, so callers pass a placeholder). */
export const StarRating = ({
    rating = 5,
    className,
}: {
    rating?: number
    className?: string
}) => (
    <span
        className={classNames('flex items-center gap-0.5', className)}
        role="img"
        aria-label={`Rated ${rating} out of 5`}
    >
        {[1, 2, 3, 4, 5].map((star) => (
            <Star
                key={star}
                aria-hidden
                className={classNames(
                    'h-3 w-3',
                    star <= Math.round(rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-gray-200 text-gray-200',
                )}
            />
        ))}
    </span>
)

export const QuantityStepper = ({
    quantity,
    label,
    onDecrease,
    onIncrease,
}: {
    quantity: number
    label: string
    onDecrease: () => void
    onIncrease: () => void
}) => (
    <div className="flex items-center gap-1">
        <Button
            size="xs"
            shape="circle"
            icon={<HiOutlineMinus />}
            aria-label={`Decrease ${label}`}
            onClick={onDecrease}
        />
        <span
            className="min-w-6 text-center text-sm font-medium text-gray-900"
            aria-live="polite"
        >
            {quantity}
        </span>
        <Button
            size="xs"
            shape="circle"
            icon={<HiOutlinePlus />}
            aria-label={`Increase ${label}`}
            onClick={onIncrease}
        />
    </div>
)
