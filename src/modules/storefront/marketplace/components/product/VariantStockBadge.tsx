'use client'

import classNames from '@/utils/classNames'
import type { StorefrontAvailability } from '@/modules/sd/services/productCatalogService'

const LOW_STOCK_AT = 10

type VariantStockBadgeProps = {
    stock: StorefrontAvailability | null | undefined
    loading?: boolean
    compact?: boolean
    /** Plain text — no pill background (variant list). */
    minimal?: boolean
    className?: string
}

const VariantStockBadge = ({
    stock,
    loading = false,
    compact = false,
    minimal = false,
    className,
}: VariantStockBadgeProps) => {
    if (loading) {
        return (
            <span
                className={classNames(
                    minimal
                        ? 'text-xs text-gray-400'
                        : 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-400',
                    className,
                )}
            >
                …
            </span>
        )
    }

    if (!stock || stock.state === 'NON_INVENTORY') {
        if (minimal) {
            return (
                <span className={classNames('text-xs text-gray-500', className)}>
                    In stock
                </span>
            )
        }
        return (
            <span
                className={classNames(
                    'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600',
                    className,
                )}
            >
                Available
            </span>
        )
    }

    const available = Math.max(0, Math.floor(stock.availableQuantity))
    const soldOut =
        stock.state === 'OUT_OF_STOCK' ||
        stock.state === 'NOT_MAPPED' ||
        available <= 0

    if (soldOut) {
        const label =
            stock.state === 'NOT_MAPPED' ? 'Unavailable' : 'Out of stock'
        if (minimal) {
            return (
                <span
                    className={classNames('text-xs text-gray-400', className)}
                >
                    {label}
                </span>
            )
        }
        return (
            <span
                className={classNames(
                    'inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700',
                    className,
                )}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {label}
            </span>
        )
    }

    const low = available <= LOW_STOCK_AT
    const label = compact
        ? low
            ? `${available} left`
            : `${available} in stock`
        : low
          ? `Only ${available} left`
          : `${available} available`

    if (minimal) {
        return (
            <span
                className={classNames(
                    'text-xs tabular-nums',
                    low ? 'text-amber-700' : 'text-gray-500',
                    className,
                )}
            >
                {label}
            </span>
        )
    }

    return (
        <span
            className={classNames(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                low
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-emerald-50 text-emerald-800',
                className,
            )}
        >
            <span
                className={classNames(
                    'h-1.5 w-1.5 rounded-full',
                    low ? 'bg-amber-500' : 'bg-emerald-500',
                )}
            />
            {label}
        </span>
    )
}

export default VariantStockBadge
