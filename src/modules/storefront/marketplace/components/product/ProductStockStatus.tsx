'use client'

import classNames from '@/utils/classNames'
import type { StorefrontAvailability } from '@/modules/sd/services/productCatalogService'

const LOW_STOCK_AT = 10

type ProductStockStatusProps = {
    loading: boolean
    stock: StorefrontAvailability | null
    available: number | null
    soldOut: boolean
    className?: string
}

const ProductStockStatus = ({
    loading,
    stock,
    available,
    soldOut,
    className,
}: ProductStockStatusProps) => {
    if (loading) {
        return (
            <p className={classNames('text-sm text-gray-400', className)}>
                Checking stock…
            </p>
        )
    }
    if (!stock || stock.state === 'NON_INVENTORY') return null

    const [dot, text, label] = soldOut
        ? [
              'bg-rose-500',
              'text-rose-600',
              stock.state === 'NOT_MAPPED'
                  ? 'Not available online'
                  : 'Out of stock',
          ]
        : (available ?? 0) <= LOW_STOCK_AT
          ? [
                'bg-amber-500',
                'text-amber-700',
                `Only ${available} left in stock`,
            ]
          : [
                'bg-emerald-500',
                'text-emerald-700',
                `In stock · ${available} available`,
            ]

    return (
        <p
            className={classNames(
                'flex items-center gap-2 text-sm font-medium',
                text,
                className,
            )}
        >
            <span className="relative flex h-2 w-2">
                {!soldOut ? (
                    <span
                        className={classNames(
                            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none',
                            dot,
                        )}
                    />
                ) : null}
                <span
                    className={classNames(
                        'relative inline-flex h-2 w-2 rounded-full',
                        dot,
                    )}
                />
            </span>
            {label}
        </p>
    )
}

export default ProductStockStatus
