'use client'

import { useState, type ReactNode } from 'react'
import {
    HiOutlineCash,
    HiOutlineCheck,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineShieldCheck,
    HiOutlineShoppingCart,
    HiOutlineTruck,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Tabs from '@/components/ui/Tabs'
import classNames from '@/utils/classNames'
import { isRenderableImageSrc } from '@/utils/productImage'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import {
    productAttribute,
    productGallery,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
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

/** Main photo first, then the gallery, without duplicates or broken links. */
const photosOf = (product: SdProductRecord) =>
    [...new Set([product.imageUrl, ...productGallery(product)])].filter((src) =>
        isRenderableImageSrc(src),
    )

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
    const photos = photosOf(product)
    const [index, setIndex] = useState(0)
    const count = photos.length
    const current = photos[index] ?? product.imageUrl
    const step = (delta: number) => setIndex((i) => (i + delta + count) % count)

    return (
        <div className="flex flex-col gap-3">
            <div className="group relative overflow-hidden rounded-xl border border-gray-100 bg-gray-50 p-6">
                <ProductImage
                    key={current}
                    product={{ imageUrl: current, name: product.name }}
                    fit="contain"
                    sizes="(max-width: 768px) 100vw, 460px"
                    className="aspect-square w-full animate-fade-up !bg-transparent"
                />
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
                    {photos.map((src, i) => (
                        <li key={src} className="shrink-0">
                            <button
                                type="button"
                                aria-label={`Show photo ${i + 1}`}
                                aria-current={i === index}
                                className={classNames(
                                    'block h-16 w-16 cursor-pointer overflow-hidden rounded-lg border-2 bg-gray-50 p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                                    i === index
                                        ? 'border-emerald-500'
                                        : 'border-transparent opacity-70 hover:opacity-100',
                                )}
                                onClick={() => setIndex(i)}
                            >
                                <ProductImage
                                    product={{
                                        imageUrl: src,
                                        name: product.name,
                                    }}
                                    fit="contain"
                                    sizes="64px"
                                    className="h-full w-full !bg-transparent"
                                />
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
                <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 text-sm">
                    {specs.map((spec) => (
                        <div
                            key={spec.label}
                            className="grid grid-cols-5 gap-4 px-4 py-2.5 odd:bg-gray-50/60"
                        >
                            <dt className="col-span-2 text-gray-500">
                                {spec.label}
                            </dt>
                            <dd className="col-span-3 font-medium text-gray-900">
                                {spec.value}
                            </dd>
                        </div>
                    ))}
                    {warranty ? (
                        <div className="grid grid-cols-5 gap-4 px-4 py-2.5 odd:bg-gray-50/60">
                            <dt className="col-span-2 text-gray-500">
                                Warranty
                            </dt>
                            <dd className="col-span-3 font-medium text-gray-900">
                                {warranty}
                            </dd>
                        </div>
                    ) : null}
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
        <div className="max-h-[80vh] overflow-y-auto overscroll-contain pr-1 pt-2">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <Gallery product={product} />
                <div className="flex min-w-0 flex-col gap-4">
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
                            onIncrease={() => setQuantity((q) => q + 1)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            className="!h-auto !rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium"
                            customColorClass={() =>
                                'bg-white text-gray-900 hover:bg-gray-50 transition-colors'
                            }
                            icon={<HiOutlineShoppingCart />}
                            onClick={() => onAddToCart(product, quantity)}
                        >
                            Add to Cart
                        </Button>
                        <Button
                            className={PRIMARY_BUTTON_CLASS}
                            customColorClass={PRIMARY_BUTTON}
                            onClick={() => onBuyNow(product, quantity)}
                        >
                            Buy now
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="overview" className="mt-8">
                <Tabs.TabList>
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
                    <Tabs.TabContent key={tab.value} value={tab.value}>
                        <div className="pt-5">{tab.content}</div>
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
