'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import classNames from '@/utils/classNames'
import { checkStockATP } from '@/services/storefront/retailService'
import type { InventoryATP, RetailProduct } from '@/types/storefront/retail'

type RetailProductCardProps = {
    product: RetailProduct
    /** Optional overlay badge (e.g. sale callout) */
    badge?: string
    /** When set, shows as the sale price with basePrice struck through */
    salePrice?: number
}

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)

export default function RetailProductCard({
    product,
    badge,
    salePrice,
}: RetailProductCardProps) {
    const [atp, setAtp] = useState<InventoryATP | null>(null)
    const [loadingStock, setLoadingStock] = useState(true)
    const [imageLoaded, setImageLoaded] = useState(false)

    useEffect(() => {
        let active = true
        setLoadingStock(true)
        checkStockATP(product.sku)
            .then((result) => {
                if (active) setAtp(result)
            })
            .finally(() => {
                if (active) setLoadingStock(false)
            })
        return () => {
            active = false
        }
    }, [product.sku])

    const inStock = (atp?.availableQuantity ?? 0) > 0
    const soldOut = !loadingStock && !inStock
    const href = `/awic/${encodeURIComponent(product.sku)}`

    return (
        <article className="group flex flex-col">
            <Link
                href={href}
                className={classNames(
                    'relative aspect-[4/5] w-full overflow-hidden bg-brand-sage text-left shadow-[0_1px_0_rgba(15,61,46,0.06)] transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_24px_48px_rgba(10,42,32,0.12)]',
                    soldOut && 'opacity-90',
                )}
            >
                <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    unoptimized={product.imageUrl.endsWith('.svg')}
                    className={classNames(
                        'object-cover transition duration-700 ease-out group-hover:scale-[1.04]',
                        !imageLoaded && 'opacity-0',
                        imageLoaded && 'opacity-100',
                        soldOut && 'opacity-45 grayscale',
                    )}
                    sizes="(max-width: 768px) 50vw, 25vw"
                    onLoad={() => setImageLoaded(true)}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-deep/35 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                {badge ? (
                    <span className="absolute left-3 top-3 bg-brand-gold px-2.5 py-1 font-storefront-body text-xs font-semibold uppercase tracking-wide text-brand-deep">
                        {badge}
                    </span>
                ) : (
                    <span className="absolute left-3 top-3 bg-brand-canvas/90 px-2.5 py-1 font-storefront-body text-xs font-medium text-brand-ink backdrop-blur-sm">
                        {product.category}
                    </span>
                )}
                <span
                    className={classNames(
                        'absolute inset-x-3 bottom-3 translate-y-3 bg-brand-gold py-3 text-center font-storefront-body text-sm font-semibold text-brand-deep opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100',
                        soldOut && 'hidden',
                    )}
                >
                    View details
                </span>
                {soldOut ? (
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-brand-deep/90 py-2 text-center font-storefront-body text-sm font-semibold text-brand-gold-soft">
                        Sold out
                    </span>
                ) : null}
            </Link>

            <Link href={href} className="mt-4 space-y-1.5 px-0.5">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="font-storefront-body text-base font-medium leading-snug text-brand-ink transition-colors group-hover:text-brand-gold md:text-[17px]">
                        {product.name}
                    </h3>
                    {!loadingStock && inStock ? (
                        <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-ink"
                            title="In stock"
                            aria-label="In stock"
                        />
                    ) : null}
                </div>
                {salePrice != null && salePrice < product.basePrice ? (
                    <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-storefront-body">
                        <span className="text-base font-medium line-through opacity-45 md:text-lg">
                            {formatPrice(product.basePrice)}
                        </span>
                        <span className="text-lg font-semibold text-brand-gold md:text-xl">
                            {formatPrice(salePrice)}
                        </span>
                    </p>
                ) : (
                    <p className="font-storefront-body text-lg font-semibold text-brand-gold md:text-xl">
                        {formatPrice(product.basePrice)}
                    </p>
                )}
            </Link>
        </article>
    )
}
