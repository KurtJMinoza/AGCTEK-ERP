'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
    HiOutlineCash,
    HiOutlineCheck,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineShieldCheck,
    HiOutlineShoppingCart,
    HiOutlineTruck,
    HiPlay,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Tabs from '@/components/ui/Tabs'
import classNames from '@/utils/classNames'
import { isRenderableImageSrc } from '@/utils/productImage'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import {
    fetchStorefrontAvailability,
    productAttribute,
    productImageGallery,
    productVideos,
    type SdProductRecord,
    type StorefrontAvailability,
} from '@/modules/sd/services/productCatalogService'
import {
    measurementSpecs,
    productMeasurements,
} from '@/modules/sd/services/productMeasurements'
import { discountPercent } from './MarketplaceProductCard'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    SellerTag,
    StarRating,
    formatPrice,
} from '../marketplaceUi'

type Spec = { label: string; value: string }
type Review = {
    id: string
    title?: string
    body?: string
    author?: string
    date?: string
    rating: number
}

const strings = (product: SdProductRecord, keys: string[]) =>
    keys
        .flatMap((key) => productAttribute<unknown>(product, key, []))
        .filter(
            (value): value is string =>
                typeof value === 'string' && value.trim() !== '',
        )

const specsOf = (product: SdProductRecord): Spec[] => {
    const specs = productAttribute<unknown[]>(product, 'specs', []).filter(
        (spec): spec is Spec =>
            typeof spec === 'object' &&
            spec !== null &&
            typeof (spec as Spec).label === 'string' &&
            (spec as Spec).value !== undefined,
    )
    const brand = productAttribute<string | null>(product, 'brand', null)
    const weightKg = productAttribute<number | null>(product, 'weightKg', null)
    return [
        ...(brand ? [{ label: 'Brand', value: brand }] : []),
        ...specs.map((spec) => ({
            label: spec.label,
            value: String(spec.value),
        })),
        ...(weightKg !== null
            ? [{ label: 'LPG content', value: `${weightKg} kg` }]
            : []),
        ...measurementSpecs(productMeasurements(product)),
        { label: 'Category', value: product.category },
        { label: 'SKU', value: product.sku },
    ]
}

const reviewsOf = (product: SdProductRecord): Review[] =>
    productAttribute<unknown[]>(product, 'reviews', []).filter(
        (review): review is Review =>
            typeof review === 'object' &&
            review !== null &&
            typeof (review as Review).rating === 'number',
    )

const AUTOPLAY_MS = 4000
const MAX_QUANTITY = 99
const LOW_STOCK_AT = 10

type Media = { kind: 'image' | 'video'; src: string }

/** Front photo first, then the other photos, then product videos. */
const mediaOf = (product: SdProductRecord): Media[] => [
    ...productImageGallery(product)
        .filter((src) => isRenderableImageSrc(src))
        .map((src) => ({ kind: 'image' as const, src })),
    ...productVideos(product).map((src) => ({ kind: 'video' as const, src })),
]

const formatReviewDate = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('en-PH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
}

const TAB_CLASS =
    'hover:!text-emerald-700 aria-selected:!border-emerald-600 aria-selected:!text-emerald-700'

const Gallery = ({ product }: { product: SdProductRecord }) => {
    const media = mediaOf(product)
    const slides: Media[] = media.length
        ? media
        : [{ kind: 'image', src: product.imageUrl }]
    const [index, setIndex] = useState(0)
    const [paused, setPaused] = useState(false)
    const count = media.length
    const onVideo = slides[index]?.kind === 'video'
    const step = useCallback(
        (delta: number) => setIndex((i) => (i + delta + count) % count),
        [count],
    )

    // `index` restarts the countdown after a manual change; videos are not cut off.
    useEffect(() => {
        if (count < 2 || paused || onVideo) return
        const timer = window.setTimeout(() => step(1), AUTOPLAY_MS)
        return () => window.clearTimeout(timer)
    }, [count, paused, onVideo, step, index])

    return (
        <div
            className="flex flex-col gap-3"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div className="group relative h-64 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 md:h-[min(20rem,34vh)]">
                {slides.map((slide, i) => (
                    <div
                        key={`${slide.src}-${i}`}
                        aria-hidden={i !== index}
                        className={classNames(
                            'absolute inset-0 transition-all duration-700 ease-out',
                            slide.kind === 'video' ? 'bg-black' : 'p-6',
                            i === index
                                ? 'scale-100 opacity-100'
                                : 'pointer-events-none scale-105 opacity-0',
                        )}
                    >
                        {slide.kind === 'video' ? (
                            // Mounted only while shown so hidden videos never keep playing.
                            i === index ? (
                                <video
                                    src={slide.src}
                                    controls
                                    autoPlay
                                    muted
                                    playsInline
                                    className="h-full w-full object-contain"
                                    onEnded={() => step(1)}
                                />
                            ) : null
                        ) : (
                            <ProductImage
                                product={{
                                    imageUrl: slide.src,
                                    name: product.name,
                                }}
                                fit="contain"
                                sizes="(max-width: 768px) 100vw, 460px"
                                className="h-full w-full !bg-transparent"
                            />
                        )}
                    </div>
                ))}
                {count > 1 ? (
                    <>
                        {(
                            [
                                [
                                    -1,
                                    'left-3',
                                    HiOutlineChevronLeft,
                                    'Previous photo',
                                ],
                                [
                                    1,
                                    'right-3',
                                    HiOutlineChevronRight,
                                    'Next photo',
                                ],
                            ] as const
                        ).map(([delta, side, Icon, label]) => (
                            <button
                                key={label}
                                type="button"
                                aria-label={label}
                                className={classNames(
                                    'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white/90 text-gray-700 shadow-sm transition hover:bg-white hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:opacity-0 md:group-hover:opacity-100',
                                    side,
                                )}
                                onClick={() => step(delta)}
                            >
                                <Icon className="text-lg" />
                            </button>
                        ))}
                        <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-gray-600 shadow-sm">
                            {index + 1} / {count}
                        </span>
                    </>
                ) : null}
            </div>
            {count > 1 ? (
                <ul className="hide-scrollbar flex gap-2 overflow-x-auto">
                    {media.map((item, i) => (
                        <li key={item.src} className="shrink-0">
                            <button
                                type="button"
                                aria-label={`Show ${item.kind === 'video' ? 'video' : 'photo'} ${i + 1}`}
                                aria-current={i === index}
                                className={classNames(
                                    'relative block h-14 w-14 cursor-pointer overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                                    item.kind === 'video'
                                        ? 'bg-black'
                                        : 'bg-gray-50 p-1',
                                    i === index
                                        ? 'border-emerald-500'
                                        : 'border-transparent opacity-70 hover:opacity-100',
                                )}
                                onClick={() => setIndex(i)}
                            >
                                {item.kind === 'video' ? (
                                    <>
                                        <video
                                            src={item.src}
                                            preload="metadata"
                                            muted
                                            playsInline
                                            className="pointer-events-none h-full w-full object-cover"
                                        />
                                        <HiPlay className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl text-white/90" />
                                    </>
                                ) : (
                                    <ProductImage
                                        product={{
                                            imageUrl: item.src,
                                            name: product.name,
                                        }}
                                        fit="contain"
                                        sizes="64px"
                                        className="h-full w-full !bg-transparent"
                                    />
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

const Perk = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <li className="flex items-center gap-2 text-xs text-gray-600">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600">
            {icon}
        </span>
        {children}
    </li>
)

const StockStatus = ({
    loading,
    stock,
    available,
    soldOut,
}: {
    loading: boolean
    stock: StorefrontAvailability | null
    available: number | null
    soldOut: boolean
}) => {
    if (loading) {
        return <p className="text-sm text-gray-400">Checking stock…</p>
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
            )}
        >
            <span className={classNames('h-2 w-2 rounded-full', dot)} />
            {label}
        </p>
    )
}

type MarketplaceProductDialogProps = {
    product: SdProductRecord | null
    onClose: () => void
    onAddToCart: (product: SdProductRecord, quantity: number) => void
    onBuyNow: (product: SdProductRecord, quantity: number) => void
}

const ProductDetail = ({
    product,
    onAddToCart,
    onBuyNow,
}: Omit<MarketplaceProductDialogProps, 'product' | 'onClose'> & {
    product: SdProductRecord
}) => {
    const [quantity, setQuantity] = useState(1)
    const [activeTab, setActiveTab] = useState('overview')
    const [stock, setStock] = useState<StorefrontAvailability | null>(null)
    const [stockLoading, setStockLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        setStockLoading(true)
        fetchStorefrontAvailability(product.divisionId, product.sku)
            .then((result) => {
                if (!cancelled) setStock(result)
            })
            .catch(() => {
                if (!cancelled) setStock(null)
            })
            .finally(() => {
                if (!cancelled) setStockLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [product.divisionId, product.sku])

    const unlimited = stock?.state === 'NON_INVENTORY'
    const available = stock
        ? Math.max(0, Math.floor(stock.availableQuantity))
        : null
    const soldOut = !unlimited && available !== null && available <= 0
    const maxQuantity =
        unlimited || available === null
            ? MAX_QUANTITY
            : Math.min(available, MAX_QUANTITY)

    useEffect(() => {
        setQuantity((q) => Math.max(1, Math.min(q, maxQuantity)))
    }, [maxQuantity])

    const discount = discountPercent(product)
    const tagline = productAttribute<string | null>(product, 'tagline', null)
    const details = productAttribute<string | null>(product, 'details', null)
    const warranty = productAttribute<string | null>(product, 'warranty', null)
    const highlights = strings(product, ['features', 'keyFeatures'])
    const inBox = strings(product, ['inclusions', 'includes'])
    const specs = specsOf(product)
    const reviews = reviewsOf(product)
    const averageRating = reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null

    const tabs = [
        {
            value: 'overview',
            label: 'Overview',
            content: (
                <div className="flex flex-col gap-5">
                    {details || product.description ? (
                        <p className="text-sm leading-relaxed text-gray-600">
                            {details ?? product.description}
                        </p>
                    ) : null}
                    {highlights.length > 0 ? (
                        <div>
                            <h4 className="mb-3 text-sm font-semibold text-gray-900">
                                Highlights
                            </h4>
                            <ul className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
                                {highlights.map((point) => (
                                    <li key={point} className="flex gap-2">
                                        <HiOutlineCheck className="mt-0.5 shrink-0 text-emerald-600" />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                    {inBox.length > 0 ? (
                        <div>
                            <h4 className="mb-3 text-sm font-semibold text-gray-900">
                                What&apos;s included
                            </h4>
                            <ul className="flex flex-wrap gap-2">
                                {inBox.map((item) => (
                                    <li
                                        key={item}
                                        className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-xs text-gray-600"
                                    >
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            value: 'specs',
            label: 'Specifications',
            content: (
                <dl className="grid grid-cols-1 gap-x-8 text-sm sm:grid-cols-2">
                    {[
                        ...specs,
                        ...(warranty
                            ? [{ label: 'Warranty', value: warranty }]
                            : []),
                    ].map((spec) => (
                        <div
                            key={spec.label}
                            className="flex justify-between gap-4 border-b border-gray-100 py-2"
                        >
                            <dt className="shrink-0 text-gray-500">
                                {spec.label}
                            </dt>
                            <dd className="text-right font-medium text-gray-900">
                                {spec.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            ),
        },
        ...(reviews.length > 0
            ? [
                  {
                      value: 'reviews',
                      label: `Reviews (${reviews.length})`,
                      content: (
                          <ul className="flex flex-col gap-3">
                              {reviews.map((review) => (
                                  <li
                                      key={review.id}
                                      className="rounded-xl border border-gray-100 p-4"
                                  >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                          <StarRating rating={review.rating} />
                                          <span className="text-xs text-gray-400">
                                              {review.author}
                                              {review.date
                                                  ? ` · ${formatReviewDate(review.date)}`
                                                  : ''}
                                          </span>
                                      </div>
                                      {review.title ? (
                                          <p className="mt-2 text-sm font-semibold text-gray-900">
                                              {review.title}
                                          </p>
                                      ) : null}
                                      {review.body ? (
                                          <p className="mt-1 text-sm leading-relaxed text-gray-600">
                                              {review.body}
                                          </p>
                                      ) : null}
                                  </li>
                              ))}
                          </ul>
                      ),
                  },
              ]
            : []),
    ]

    return (
        // Sized under .dialog-content's max height + padding so the dialog never scrolls on desktop;
        // only the tab panel absorbs overflow.
        <div className="hide-scrollbar flex max-h-[calc(100dvh-6rem)] flex-col overflow-y-auto overscroll-contain md:max-h-[min(46rem,calc(100dvh-6rem))] md:overflow-hidden">
            <div className="grid shrink-0 grid-cols-1 gap-6 md:grid-cols-2">
                <Gallery product={product} />
                <div className="flex min-w-0 flex-col gap-3">
                    <SellerTag
                        divisionId={product.divisionId}
                        className="self-start"
                    />
                    <div>
                        <h3 className="text-2xl font-semibold leading-snug tracking-tight text-gray-900">
                            {product.name}
                        </h3>
                        {tagline ? (
                            <p className="mt-1 text-sm text-gray-500">
                                {tagline}
                            </p>
                        ) : null}
                    </div>
                    {averageRating !== null ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <StarRating rating={averageRating} />
                            <span className="font-medium text-gray-700">
                                {averageRating.toFixed(1)}
                            </span>
                            · {reviews.length} review
                            {reviews.length === 1 ? '' : 's'}
                        </div>
                    ) : null}
                    <div className="rounded-xl bg-gray-50 px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span
                                className={classNames(
                                    'text-3xl font-bold',
                                    discount
                                        ? 'text-rose-600'
                                        : 'text-gray-900',
                                )}
                            >
                                {formatPrice(product.price)}
                            </span>
                            {discount ? (
                                <>
                                    <span className="text-sm text-gray-400 line-through">
                                        {formatPrice(product.originalPrice!)}
                                    </span>
                                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-600">
                                        −{discount}%
                                    </span>
                                </>
                            ) : null}
                        </div>
                        {discount ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                                You save{' '}
                                {formatPrice(
                                    product.originalPrice! - product.price,
                                )}
                            </p>
                        ) : null}
                    </div>
                    <StockStatus
                        loading={stockLoading}
                        stock={stock}
                        available={available}
                        soldOut={soldOut}
                    />
                    {product.badge ? (
                        <span className="self-start rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            {product.badge}
                        </span>
                    ) : null}
                    {product.description && details ? (
                        <p className="text-sm leading-relaxed text-gray-500">
                            {product.description}
                        </p>
                    ) : null}
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Perk icon={<HiOutlineTruck />}>
                            Delivered by{' '}
                            {productDivisionLabel(product.divisionId)}
                        </Perk>
                        <Perk icon={<HiOutlineCash />}>Cash on delivery</Perk>
                        {warranty ? (
                            <Perk icon={<HiOutlineShieldCheck />}>
                                {warranty}
                            </Perk>
                        ) : null}
                    </ul>
                    <div className="mt-auto flex items-center gap-3 pt-2">
                        <span className="text-sm text-gray-500">Quantity</span>
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            onDecrease={() =>
                                setQuantity((q) => Math.max(1, q - 1))
                            }
                            onIncrease={() =>
                                setQuantity((q) => Math.min(maxQuantity, q + 1))
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            className="!h-auto !rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium"
                            customColorClass={() =>
                                'bg-white text-gray-900 hover:bg-gray-50 transition-colors'
                            }
                            icon={<HiOutlineShoppingCart />}
                            disabled={soldOut}
                            onClick={() => onAddToCart(product, quantity)}
                        >
                            Add to Cart
                        </Button>
                        <Button
                            className={PRIMARY_BUTTON_CLASS}
                            customColorClass={PRIMARY_BUTTON}
                            disabled={soldOut}
                            onClick={() => onBuyNow(product, quantity)}
                        >
                            Buy now
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs
                value={activeTab}
                onChange={(value) => setActiveTab(String(value))}
                className="mt-4 flex min-h-0 flex-col"
            >
                <Tabs.TabList className="shrink-0">
                    {tabs.map((tab) => (
                        <Tabs.TabNav
                            key={tab.value}
                            value={tab.value}
                            className={TAB_CLASS}
                        >
                            {tab.label}
                        </Tabs.TabNav>
                    ))}
                </Tabs.TabList>
                {tabs.map((tab) => (
                    <Tabs.TabContent
                        key={tab.value}
                        value={tab.value}
                        className={
                            tab.value === activeTab
                                ? 'hide-scrollbar min-h-0 overflow-y-auto overscroll-contain'
                                : 'hidden'
                        }
                    >
                        <div className="pt-4">
                            {tab.content}
                        </div>
                    </Tabs.TabContent>
                ))}
            </Tabs>
        </div>
    )
}

const MarketplaceProductDialog = ({
    product,
    onClose,
    ...actions
}: MarketplaceProductDialogProps) => (
    <Dialog
        isOpen={product !== null}
        width={1000}
        onClose={onClose}
        onRequestClose={onClose}
    >
        {product ? (
            <ProductDetail
                key={`${product.divisionId}:${product.sku}`}
                product={product}
                {...actions}
            />
        ) : null}
    </Dialog>
)

export default MarketplaceProductDialog
