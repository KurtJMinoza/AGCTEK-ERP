'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { HiOutlineStar, HiStar } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/storefront/retail/StorefrontConfirmDialog'
import CartDrawer from '@/components/storefront/retail/CartDrawer'
import ClientLoginDialog from '@/components/storefront/retail/ClientLoginDialog'
import StorefrontSiteHeader from '@/components/storefront/retail/StorefrontSiteHeader'
import classNames from '@/utils/classNames'
import {
    checkStockATP,
    fetchRetailProductBySku,
} from '@/services/storefront/retailService'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailCartSync } from '@/modules/storefront/retail/hooks/useRetailCartSync'
import {
    getSeptemberSalePrice,
    SEPTEMBER_SALE_DISCOUNT,
} from '@/modules/storefront/retail/brand'
import type {
    InventoryATP,
    RetailProduct,
} from '@/types/storefront/retail'

const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value)

function StarRating({ rating }: { rating: number }) {
    return (
        <div
            className="flex items-center gap-0.5"
            aria-label={`${rating} of 5 stars`}
        >
            {Array.from({ length: 5 }).map((_, index) => {
                const filled = index < Math.round(rating)
                const Icon = filled ? HiStar : HiOutlineStar
                return (
                    <Icon
                        key={index}
                        className={classNames(
                            'text-lg',
                            filled ? 'text-brand-gold' : 'text-brand-ink/25',
                        )}
                    />
                )
            })}
        </div>
    )
}

export default function RetailProductDetailPage() {
    const params = useParams<{ sku: string }>()
    const router = useRouter()
    const sku = decodeURIComponent(params.sku ?? '')

    useRetailCartSync()

    const addItem = useRetailCartStore((s) => s.addItem)

    const [product, setProduct] = useState<RetailProduct | null>(null)
    const [atp, setAtp] = useState<InventoryATP | null>(null)
    const [loading, setLoading] = useState(true)
    const [quantity, setQuantity] = useState(1)
    const [notFound, setNotFound] = useState(false)
    const [confirmAction, setConfirmAction] = useState<'add' | 'buy' | null>(
        null,
    )

    useEffect(() => {
        let active = true
        setLoading(true)
        setNotFound(false)
        Promise.all([fetchRetailProductBySku(sku), checkStockATP(sku)])
            .then(([nextProduct, nextAtp]) => {
                if (!active) return
                if (!nextProduct) {
                    setNotFound(true)
                    setProduct(null)
                    return
                }
                setProduct(nextProduct)
                setAtp(nextAtp)
                setQuantity(1)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [sku])

    const inStock = (atp?.availableQuantity ?? 0) > 0
    const soldOut = !loading && !!product && !inStock
    const salePrice = product
        ? getSeptemberSalePrice(product.basePrice)
        : null
    const salePercent = Math.round(SEPTEMBER_SALE_DISCOUNT * 100)

    const averageRating = useMemo(() => {
        if (!product?.reviews.length) return 0
        const sum = product.reviews.reduce((acc, r) => acc + r.rating, 0)
        return sum / product.reviews.length
    }, [product])

    const handleAddToCart = () => {
        if (!product || !inStock) return
        setConfirmAction('add')
    }

    const handleBuyNow = () => {
        if (!product || !inStock) return
        setConfirmAction('buy')
    }

    const runConfirmedAction = () => {
        if (!product || !confirmAction) return
        if (confirmAction === 'add') {
            addItem(product, quantity)
        } else {
            addItem(product, quantity, { openDrawer: false })
            router.push('/awic/checkout')
        }
        setConfirmAction(null)
    }

    return (
        <div className="min-h-screen bg-brand-canvas text-brand-ink">
            <StorefrontSiteHeader />

            {loading ? (
                <div className="mx-auto grid max-w-[1320px] gap-10 px-6 py-16 lg:grid-cols-2 lg:px-10">
                    <div className="aspect-[4/5] animate-pulse bg-brand-sage" />
                    <div className="space-y-4">
                        <div className="h-8 w-2/3 animate-pulse bg-brand-sage" />
                        <div className="h-6 w-1/3 animate-pulse bg-brand-sage" />
                        <div className="h-24 w-full animate-pulse bg-brand-sage" />
                    </div>
                </div>
            ) : notFound || !product ? (
                <div className="mx-auto max-w-lg px-6 py-28 text-center">
                    <p className="font-storefront-heading text-2xl font-semibold tracking-tight text-brand-ink">
                        Product not found
                    </p>
                    <p className="mt-3 font-storefront-body text-base text-brand-ink/60">
                        This item may have moved or is no longer listed.
                    </p>
                    <Button
                        className="mt-8"
                        variant="solid"
                        customColorClass={() =>
                            'rounded-none border-0 bg-brand-deep px-8 font-storefront-body text-sm font-semibold uppercase tracking-[0.08em] text-brand-gold-soft hover:bg-brand-ink'
                        }
                        onClick={() => router.push('/awic')}
                    >
                        Return to shop
                    </Button>
                </div>
            ) : (
                <main>
                    <div className="border-b border-brand-gold/25 bg-brand-deep">
                        <div className="mx-auto flex max-w-[1320px] items-center gap-2 px-6 py-3 lg:px-10">
                            <Link
                                href="/awic"
                                className="font-storefront-body text-sm text-brand-gold-soft/70 transition-colors hover:text-brand-gold"
                            >
                                Shop
                            </Link>
                            <span className="text-brand-gold/40">/</span>
                            <span className="font-storefront-body text-sm text-brand-gold-soft/70">
                                {product.category}
                            </span>
                            <span className="text-brand-gold/40">/</span>
                            <span className="truncate font-storefront-body text-sm text-brand-gold">
                                {product.name}
                            </span>
                        </div>
                    </div>

                    <div className="mx-auto max-w-[1320px] px-6 py-10 lg:px-10 lg:py-14">
                        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
                            <div className="relative aspect-[4/5] overflow-hidden border border-brand-gold/20 bg-brand-sage shadow-[0_20px_50px_rgba(10,42,32,0.12)]">
                                <Image
                                    src={product.imageUrl}
                                    alt={product.name}
                                    fill
                                    priority
                                    unoptimized={product.imageUrl.endsWith(
                                        '.svg',
                                    )}
                                    className="object-cover"
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-deep/30 via-transparent to-transparent" />
                                <span className="absolute left-4 top-4 bg-brand-gold px-3 py-1.5 font-storefront-body text-xs font-semibold uppercase tracking-[0.12em] text-brand-deep">
                                    Sale · {salePercent}% off
                                </span>
                            </div>

                            <div className="flex flex-col border border-brand-line bg-brand-sage/30 p-6 lg:p-8">
                                <p className="font-storefront-body text-sm font-semibold uppercase tracking-[0.14em] text-brand-gold">
                                    {product.category}
                                </p>
                                <h1 className="mt-2 font-storefront-heading text-3xl font-semibold uppercase tracking-[0.04em] text-brand-ink md:text-4xl">
                                    {product.name}
                                </h1>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <StarRating rating={averageRating} />
                                    <span className="font-storefront-body text-sm text-brand-ink/55">
                                        {product.reviews.length} review
                                        {product.reviews.length === 1
                                            ? ''
                                            : 's'}
                                    </span>
                                </div>
                                <div className="mt-5 flex w-fit items-baseline gap-3">
                                    <span className="font-storefront-body text-lg font-medium text-brand-ink/40 line-through md:text-xl">
                                        {formatPrice(product.basePrice)}
                                    </span>
                                    <span className="font-storefront-body text-3xl font-semibold text-brand-ink md:text-4xl">
                                        {formatPrice(salePrice ?? product.basePrice)}
                                    </span>
                                </div>
                                <p className="mt-6 font-storefront-body text-base leading-relaxed text-brand-ink/80">
                                    {product.description}
                                </p>
                                <p className="mt-4 font-storefront-body text-base leading-relaxed text-brand-ink/70">
                                    {product.details}
                                </p>

                                <div className="mt-8 border-t border-brand-gold/25 pt-6">
                                    <p className="font-storefront-body text-sm font-semibold uppercase tracking-[0.1em] text-brand-ink">
                                        Quantity
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                        <div className="flex items-center border border-brand-gold/35 bg-brand-canvas">
                                            <button
                                                type="button"
                                                aria-label="Decrease quantity"
                                                disabled={
                                                    quantity <= 1 || soldOut
                                                }
                                                onClick={() =>
                                                    setQuantity((q) =>
                                                        Math.max(1, q - 1),
                                                    )
                                                }
                                                className="flex h-11 w-11 items-center justify-center text-lg text-brand-ink transition-colors hover:bg-brand-sage hover:text-brand-gold disabled:opacity-40"
                                            >
                                                −
                                            </button>
                                            <span className="min-w-12 border-x border-brand-gold/25 text-center font-storefront-body text-lg font-semibold text-brand-ink">
                                                {quantity}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Increase quantity"
                                                disabled={soldOut}
                                                onClick={() =>
                                                    setQuantity((q) => q + 1)
                                                }
                                                className="flex h-11 w-11 items-center justify-center text-lg text-brand-ink transition-colors hover:bg-brand-sage hover:text-brand-gold disabled:opacity-40"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <span className="font-storefront-body text-sm text-brand-ink/55">
                                            {soldOut
                                                ? 'Sold out'
                                                : `${atp?.availableQuantity ?? 0} available`}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <Button
                                        variant="solid"
                                        disabled={soldOut}
                                        customColorClass={() =>
                                            classNames(
                                                'h-12 flex-1 rounded-none border-0 bg-brand-deep font-storefront-body text-sm font-semibold uppercase tracking-[0.1em] text-brand-gold-soft hover:bg-brand-ink',
                                                soldOut &&
                                                    'cursor-not-allowed opacity-40',
                                            )
                                        }
                                        onClick={handleAddToCart}
                                    >
                                        Add to bag
                                    </Button>
                                    <Button
                                        variant="solid"
                                        disabled={soldOut}
                                        customColorClass={() =>
                                            classNames(
                                                'h-12 flex-1 rounded-none border-0 bg-brand-gold font-storefront-body text-sm font-semibold uppercase tracking-[0.1em] text-brand-deep hover:bg-brand-gold-soft',
                                                soldOut &&
                                                    'cursor-not-allowed opacity-40',
                                            )
                                        }
                                        onClick={handleBuyNow}
                                    >
                                        Buy now
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <section className="mt-16 border-t-2 border-brand-gold/30 pt-12 lg:mt-20">
                            <div className="mb-2 h-1 w-16 bg-brand-gold" />
                            <h2 className="font-storefront-heading text-2xl font-semibold uppercase tracking-[0.06em] text-brand-ink">
                                Features
                            </h2>
                            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                                {product.features.map((feature) => (
                                    <li
                                        key={feature}
                                        className="flex gap-3 border border-brand-gold/20 bg-brand-sage/50 px-5 py-4 font-storefront-body text-base text-brand-ink"
                                    >
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="mt-16 border-t-2 border-brand-gold/30 bg-brand-deep px-6 py-12 lg:mt-20 lg:px-10">
                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <div>
                                    <div className="mb-2 h-1 w-16 bg-brand-gold" />
                                    <h2 className="font-storefront-heading text-2xl font-semibold uppercase tracking-[0.06em] text-brand-gold-soft">
                                        Customer reviews
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <StarRating rating={averageRating} />
                                    <span className="font-storefront-body text-base font-semibold text-brand-gold">
                                        {averageRating.toFixed(1)}
                                    </span>
                                </div>
                            </div>

                            {product.reviews.length === 0 ? (
                                <p className="mt-6 font-storefront-body text-base text-brand-gold-soft/60">
                                    No reviews yet for this product.
                                </p>
                            ) : (
                                <ul className="mt-8 space-y-5">
                                    {product.reviews.map((review) => (
                                        <li
                                            key={review.id}
                                            className="border border-brand-gold/25 bg-brand-ink/40 px-6 py-5"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-storefront-body text-base font-semibold text-brand-gold-soft">
                                                        {review.author}
                                                    </p>
                                                    <p className="mt-0.5 font-storefront-body text-sm text-brand-gold-soft/45">
                                                        {new Date(
                                                            review.date,
                                                        ).toLocaleDateString(
                                                            'en-PH',
                                                            {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            },
                                                        )}
                                                    </p>
                                                </div>
                                                <StarRating
                                                    rating={review.rating}
                                                />
                                            </div>
                                            <p className="mt-3 font-storefront-body text-base font-medium text-brand-gold">
                                                {review.title}
                                            </p>
                                            <p className="mt-2 font-storefront-body text-base leading-relaxed text-brand-gold-soft/75">
                                                {review.body}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                </main>
            )}

            <CartDrawer />
            <ClientLoginDialog />
            <ConfirmDialog
                isOpen={confirmAction !== null}
                tone={confirmAction === 'buy' ? 'caution' : 'default'}
                title={
                    confirmAction === 'buy' ? 'Buy now?' : 'Add to bag?'
                }
                confirmText={
                    confirmAction === 'buy' ? 'Continue to checkout' : 'Add to bag'
                }
                cancelText="Cancel"
                onCancel={() => setConfirmAction(null)}
                onConfirm={runConfirmedAction}
            >
                <p>
                    {confirmAction === 'buy'
                        ? `Add ${quantity} × ${product?.name ?? 'this item'} to your bag and continue to checkout.`
                        : `Add ${quantity} × ${product?.name ?? 'this item'} to your bag.`}
                </p>
            </ConfirmDialog>
        </div>
    )
}
