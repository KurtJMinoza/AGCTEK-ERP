'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineCash,
    HiOutlineCheck,
    HiOutlineEmojiSad,
    HiOutlineLink,
    HiOutlineShieldCheck,
    HiOutlineShoppingCart,
    HiOutlineTruck,
} from 'react-icons/hi'
import { BadgeCheck, ChevronRight, Heart, Sparkles } from 'lucide-react'
import Breadcrumb from '@/components/shared/Breadcrumb'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import classNames from '@/utils/classNames'
import { productSellerLabel } from '@/modules/sd/utils/productSellerLabel'
import {
    productAttribute,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import MarketplaceHeader from '../components/MarketplaceHeader'
import { OFFICIAL_STORES } from '../components/MarketplaceOfficialStores'
import { discountPercent } from '../components/MarketplaceProductCard'
import MarketplaceProductRow from '../components/MarketplaceProductRow'
import ProductGallery from '../components/product/ProductGallery'
import ProductStockStatus from '../components/product/ProductStockStatus'
import ProductVariantSelector from '../components/product/ProductVariantSelector'
import {
    effectiveVariantCompareAt,
    effectiveVariantPrice,
    type ProductVariantDefinition,
    type VariantImageMode,
} from '@/modules/sd/services/productOptionVariantsService'
import {
    formatReviewDate,
    productReviews,
    productSpecs,
    productStrings,
} from '../components/product/productContent'
import { useProductAvailability } from '../components/product/useProductAvailability'
import { productsHref } from '../browseQuery'
import { MARKETPLACE_PATH } from '../host'
import { notify, useMarketplace } from '../MarketplaceProvider'
import {
    MARKETPLACE_NAME,
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    QuantityStepper,
    SURFACE,
    SellerTag,
    StarRating,
    divisionTheme,
    formatPrice,
    productKey,
} from '../marketplaceUi'
import { useMarketplaceBrowseStore } from '../store/useMarketplaceBrowseStore'

const RELATED_LIMIT = 12

const SECONDARY_BUTTON = () =>
    'bg-white text-gray-900 hover:bg-gray-50 transition-colors'
const SECONDARY_BUTTON_CLASS =
    '!h-auto !rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium'

const CRUMB_BUTTON =
    'cursor-pointer truncate font-medium text-emerald-700 hover:underline focus:outline-none focus-visible:underline'

const Section = ({
    id,
    title,
    icon,
    aside,
    children,
}: {
    id: string
    title: string
    icon?: ReactNode
    aside?: ReactNode
    children: ReactNode
}) => (
    <Card className={classNames('rounded-2xl', SURFACE)} bodyClass="p-6 sm:p-8">
        <section aria-labelledby={id}>
            <div className="mb-6 flex items-center justify-between gap-4">
                <h2
                    id={id}
                    className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-gray-900"
                >
                    {icon ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            {icon}
                        </span>
                    ) : null}
                    {title}
                </h2>
                {aside}
            </div>
            {children}
        </section>
    </Card>
)

const Perk = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <li className="flex items-center gap-3 text-sm text-gray-600">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-lg text-emerald-600">
            {icon}
        </span>
        <span className="min-w-0">{children}</span>
    </li>
)

const ProductPageSkeleton = () => (
    <div aria-busy="true" aria-label="Loading product">
        <Skeleton height={16} width={260} className="mb-6 rounded" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <Skeleton className="aspect-square w-full rounded-2xl lg:col-span-7" />
            <div className="flex flex-col gap-4 lg:col-span-5">
                <Skeleton height={20} width={120} className="rounded" />
                <Skeleton height={36} width="85%" className="rounded" />
                <Skeleton height={96} className="rounded-2xl" />
                <Skeleton height={16} width="50%" className="rounded" />
                <Skeleton height={72} className="rounded" />
                <Skeleton height={44} className="rounded-lg" />
            </div>
        </div>
    </div>
)

const ProductNotFound = ({ onContinue }: { onContinue: () => void }) => (
    <Card
        className={classNames('mx-auto max-w-lg rounded-2xl', SURFACE)}
        bodyClass="flex flex-col items-center gap-3 px-6 py-14 text-center"
    >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">
            <HiOutlineEmojiSad aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            We couldn&apos;t find this product
        </h1>
        <p className="text-sm text-gray-500">
            It may have been removed or is no longer sold online.
        </p>
        <Button
            className={classNames('mt-2', PRIMARY_BUTTON_CLASS)}
            customColorClass={PRIMARY_BUTTON}
            onClick={onContinue}
        >
            Continue shopping
        </Button>
    </Card>
)

const ProductView = ({ product }: { product: SdProductRecord }) => {
    const router = useRouter()
    const {
        catalog,
        quantityByKey,
        favorites,
        toggleFavorite,
        requestAdd,
        openCart,
        renderCard,
    } = useMarketplace()
    const resetBrowse = useMarketplaceBrowseStore((s) => s.reset)
    const cameFromShop = useMarketplaceBrowseStore(
        (s) => s.returnScroll !== null,
    )

    const [quantity, setQuantity] = useState(1)
    const { stock, loading, available, soldOut, maxQuantity } =
        useProductAvailability(product)
    const [selectedVariant, setSelectedVariant] =
        useState<ProductVariantDefinition | null>(null)
    const [hasVariants, setHasVariants] = useState(false)
    /** Admin setting: variant image replaces the main product photo. */
    const [variantImageMode, setVariantImageMode] =
        useState<VariantImageMode>('replace')

    useEffect(() => {
        setQuantity((q) => Math.max(1, Math.min(q, maxQuantity)))
    }, [maxQuantity])

    useEffect(() => {
        const previous = document.title
        document.title = `${product.name} | ${MARKETPLACE_NAME}`
        return () => {
            document.title = previous
        }
    }, [product.name])

    const key = productKey(product)
    const inCart = quantityByKey.get(key) ?? 0
    const favorite = favorites.has(key)
    const storeName = productSellerLabel(product)
    const store = OFFICIAL_STORES.find(
        (s) => s.divisionId === product.divisionId,
    )
    const theme = divisionTheme(product.divisionId)
    const StoreIcon = store?.icon

    const tagline = productAttribute<string | null>(product, 'tagline', null)
    const details = productAttribute<string | null>(product, 'details', null)
    const warranty = productAttribute<string | null>(product, 'warranty', null)
    const highlights = productStrings(product, ['features', 'keyFeatures'])
    const inBox = productStrings(product, ['inclusions', 'includes'])
    const specs = productSpecs(product)
    const reviews = productReviews(product)
    const averageRating = reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null

    const { similar, fromStore, storeCount } = useMemo(() => {
        const others = catalog.records.filter((p) => productKey(p) !== key)
        const similar = others
            .filter((p) => p.category === product.category)
            .slice(0, RELATED_LIMIT)
        const shown = new Set(similar.map(productKey))
        const fromStore = others
            .filter(
                (p) =>
                    p.divisionId === product.divisionId &&
                    !shown.has(productKey(p)),
            )
            .slice(0, RELATED_LIMIT)
        const storeCount = catalog.records.filter(
            (p) => p.divisionId === product.divisionId,
        ).length
        return { similar, fromStore, storeCount }
    }, [catalog.records, key, product.category, product.divisionId])

    const goShop = (filters?: { store?: string; category?: string }) => {
        if (!filters) {
            resetBrowse()
            router.push(MARKETPLACE_PATH)
            return
        }
        router.push(
            productsHref({
                stores: filters.store ? [filters.store] : [],
                categories: filters.category ? [filters.category] : [],
            }),
        )
    }

    const shareLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            notify('success', 'Link copied', 'Share it with anyone.')
        } catch {
            notify('danger', 'Could not copy link', window.location.href)
        }
    }

    const unavailableLabel =
        stock?.state === 'NOT_MAPPED' ? 'Unavailable' : 'Out of stock'
    const variantSelected = hasVariants ? Boolean(selectedVariant) : true
    const addDisabled = soldOut || (hasVariants && !selectedVariant)
    /** Cart/order snapshot: parent product + the selected sellable variant. */
    const variantSnapshot = selectedVariant
        ? {
              id: selectedVariant.id,
              name: selectedVariant.variantName,
              sku: selectedVariant.sku,
              price: effectiveVariantPrice(product.price, selectedVariant),
              barcode: selectedVariant.barcode,
              imageUrl: selectedVariant.imageUrl || undefined,
              options: selectedVariant.optionValues.map(
                  (link) => link.value,
              ),
          }
        : undefined
    const addToCart = () => {
        if (hasVariants && !selectedVariant) {
            notify(
                'danger',
                'Select a variant',
                'Choose the option values for this product first.',
            )
            return
        }
        requestAdd(product, quantity, false)
    }
    const buyNow = () => {
        if (hasVariants && !selectedVariant) {
            notify(
                'danger',
                'Select a variant',
                'Choose the option values for this product first.',
            )
            return
        }
        requestAdd(product, quantity, true)
    }

    /** Variant prices/images override the parent display once one is selected. */
    const displayPrice = effectiveVariantPrice(product.price, selectedVariant)
    const displayOriginalPrice = effectiveVariantCompareAt(
        product,
        selectedVariant,
    )
    const displayDiscount =
        displayOriginalPrice !== null && displayOriginalPrice > displayPrice
            ? Math.round(
                  (1 - displayPrice / displayOriginalPrice) * 100,
              )
            : null

    const priceBlock = (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
                className={classNames(
                    'text-[2.6rem] font-bold leading-none tracking-tight',
                    displayDiscount ? 'text-rose-600' : 'text-gray-900',
                )}
            >
                {formatPrice(displayPrice)}
            </span>
            {displayDiscount ? (
                <>
                    <span className="text-base text-gray-400 line-through">
                        {formatPrice(displayOriginalPrice!)}
                    </span>
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-600">
                        −{displayDiscount}%
                    </span>
                </>
            ) : null}
        </div>
    )

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
                {cameFromShop ? (
                    <Button
                        size="xs"
                        variant="plain"
                        className="!px-1 font-medium !text-gray-600 hover:!text-emerald-700"
                        icon={<HiOutlineArrowLeft />}
                        onClick={() => router.back()}
                    >
                        Back
                    </Button>
                ) : null}
                <Breadcrumb
                    className="min-w-0"
                    items={[
                        {
                            label: (
                                <button
                                    type="button"
                                    className={CRUMB_BUTTON}
                                    onClick={() => goShop()}
                                >
                                    Home
                                </button>
                            ),
                        },
                        {
                            label: (
                                <button
                                    type="button"
                                    className={CRUMB_BUTTON}
                                    onClick={() =>
                                        goShop({ store: product.divisionId })
                                    }
                                >
                                    {storeName}
                                </button>
                            ),
                        },
                        {
                            label: (
                                <button
                                    type="button"
                                    className={CRUMB_BUTTON}
                                    onClick={() =>
                                        goShop({
                                            store: product.divisionId,
                                            category: product.category,
                                        })
                                    }
                                >
                                    {product.category}
                                </button>
                            ),
                        },
                        { label: product.name },
                    ]}
                />
            </div>

            {/* HERO */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
                <div className="min-w-0 lg:col-span-7">
                    <div className="lg:sticky lg:top-24">
                        <ProductGallery
                            product={product}
                            heroImage={
                                variantImageMode === 'replace'
                                    ? selectedVariant?.imageUrl || null
                                    : null
                            }
                        />
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
                    {/* Seller / status chips */}
                    <div className="flex flex-wrap items-center gap-2">
                        <SellerTag product={product} />
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
                            Official store
                        </span>
                        {product.badge ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                {product.badge}
                            </span>
                        ) : null}
                    </div>

                    {/* Title block */}
                    <div>
                        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-[2rem]">
                            {product.name}
                        </h1>
                        {tagline ? (
                            <p className="mt-2 text-base text-gray-500">
                                {tagline}
                            </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            {averageRating !== null ? (
                                <a
                                    href="#reviews-heading"
                                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-emerald-700"
                                >
                                    <StarRating rating={averageRating} />
                                    <span className="font-medium text-gray-700">
                                        {averageRating.toFixed(1)}
                                    </span>
                                    <span className="text-gray-400">
                                        ({reviews.length} review
                                        {reviews.length === 1 ? '' : 's'})
                                    </span>
                                </a>
                            ) : null}
                            <span className="text-sm text-gray-400">
                                {product.sku}
                            </span>
                        </div>
                    </div>

                    {/* Options & variants */}
                    <ProductVariantSelector
                        product={product}
                        onVariantChange={setSelectedVariant}
                        onHasVariants={setHasVariants}
                        onVariantImageMode={setVariantImageMode}
                    />

                    {/* Buy panel */}
                    <Card
                        className={classNames('rounded-2xl', SURFACE)}
                        bodyClass="flex flex-col gap-5 p-6 sm:p-7"
                    >
                        <div className="flex items-end justify-between gap-4">
                            {priceBlock}
                            {displayDiscount ? (
                                <span className="shrink-0 text-sm font-medium text-emerald-700">
                                    You save{' '}
                                    {formatPrice(
                                        displayOriginalPrice! - displayPrice,
                                    )}
                                </span>
                            ) : null}
                        </div>
                        <ProductStockStatus
                            loading={loading}
                            stock={stock}
                            available={available}
                            soldOut={soldOut}
                        />
                        <div className="flex flex-col gap-4 border-t border-gray-100 pt-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-500">
                                        Quantity
                                    </span>
                                    <QuantityStepper
                                        quantity={quantity}
                                        label={product.name}
                                        onDecrease={() =>
                                            setQuantity((q) =>
                                                Math.max(1, q - 1),
                                            )
                                        }
                                        onIncrease={() =>
                                            setQuantity((q) =>
                                                Math.min(maxQuantity, q + 1),
                                            )
                                        }
                                    />
                                </div>
                                {inCart > 0 ? (
                                    <button
                                        type="button"
                                        className="cursor-pointer text-sm font-medium text-emerald-700 hover:underline"
                                        onClick={openCart}
                                    >
                                        {inCart} in your cart · View cart
                                    </button>
                                ) : null}
                            </div>
                            <div className="flex gap-3">
                                <div className="grid flex-1 grid-cols-2 gap-3">
                                    <Button
                                        className={SECONDARY_BUTTON_CLASS}
                                        customColorClass={SECONDARY_BUTTON}
                                        icon={<HiOutlineShoppingCart />}
                                        disabled={addDisabled}
                                        onClick={addToCart}
                                    >
                                        Add to Cart
                                    </Button>
                                    <Button
                                        className={classNames(
                                            PRIMARY_BUTTON_CLASS,
                                            'py-2.5',
                                        )}
                                        customColorClass={PRIMARY_BUTTON}
                                        disabled={addDisabled}
                                        onClick={buyNow}
                                    >
                                        {soldOut
                                            ? unavailableLabel
                                            : 'Buy now'}
                                    </Button>
                                </div>
                                <Button
                                    shape="circle"
                                    aria-pressed={favorite}
                                    aria-label={
                                        favorite
                                            ? 'Remove from favourites'
                                            : 'Add to favourites'
                                    }
                                    className="!h-11 !w-11 shrink-0 border border-gray-200"
                                    customColorClass={() =>
                                        'bg-white text-gray-400 hover:text-rose-500'
                                    }
                                    icon={
                                        <Heart
                                            aria-hidden
                                            className={classNames(
                                                'h-5 w-5',
                                                favorite &&
                                                    'fill-rose-500 text-rose-500',
                                            )}
                                        />
                                    }
                                    onClick={() => toggleFavorite(key)}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Highlights (top 4) */}
                    {highlights.length > 0 ? (
                        <ul className="flex flex-wrap gap-2">
                            {highlights.slice(0, 4).map((point) => (
                                <li
                                    key={point}
                                    className="flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-800"
                                >
                                    <HiOutlineCheck
                                        aria-hidden
                                        className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                                    />
                                    {point}
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {/* Short description */}
                    {product.description ? (
                        <p className="text-sm leading-relaxed text-gray-600">
                            {product.description}
                        </p>
                    ) : null}

                    {/* Trust perks */}
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Perk icon={<HiOutlineTruck />}>
                            Delivered by {storeName}
                        </Perk>
                        <Perk icon={<HiOutlineCash />}>Cash on delivery</Perk>
                        {warranty ? (
                            <Perk icon={<HiOutlineShieldCheck />}>
                                {warranty}
                            </Perk>
                        ) : null}
                        <Perk icon={<BadgeCheck className="h-4 w-4" />}>
                            Sold by the official {storeName} store
                        </Perk>
                    </ul>
                </div>
            </div>

            {/* DETAILS / SPECS / REVIEWS */}
            <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12">
                <div className="flex min-w-0 flex-col gap-8 lg:col-span-8">
                    <Section
                        id="details-heading"
                        title="Product details"
                        icon={<HiOutlineCheck aria-hidden />}
                    >
                        <div className="flex flex-col gap-6">
                            {details || product.description ? (
                                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
                                    {details ?? product.description}
                                </p>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    No description yet.
                                </p>
                            )}
                            {highlights.length > 0 ? (
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold text-gray-900">
                                        Highlights
                                    </h3>
                                    <ul className="grid grid-cols-1 gap-2.5 text-sm text-gray-600 sm:grid-cols-2">
                                        {highlights.map((point) => (
                                            <li
                                                key={point}
                                                className="flex gap-2"
                                            >
                                                <HiOutlineCheck className="mt-0.5 shrink-0 text-emerald-600" />
                                                <span>{point}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {inBox.length > 0 ? (
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold text-gray-900">
                                        What&apos;s in the box
                                    </h3>
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
                    </Section>

                    <Section
                        id="specs-heading"
                        title="Specifications"
                        icon={<Sparkles aria-hidden className="h-4 w-4" />}
                    >
                        <dl className="grid grid-cols-1 gap-x-10 text-sm sm:grid-cols-2">
                            {specs.map((spec) => (
                                <div
                                    key={spec.label}
                                    className="flex justify-between gap-4 border-b border-gray-100 py-3"
                                >
                                    <dt className="shrink-0 text-gray-500">
                                        {spec.label}
                                    </dt>
                                    <dd className="text-right font-medium text-gray-900">
                                        {spec.value}
                                    </dd>
                                </div>
                            ))}
                            {specs.length === 0 ? (
                                <p className="text-sm text-gray-400 sm:col-span-2">
                                    No specifications listed yet.
                                </p>
                            ) : null}
                        </dl>
                    </Section>

                    <Section
                        id="reviews-heading"
                        title="Customer reviews"
                        icon={<Sparkles aria-hidden className="h-4 w-4" />}
                        aside={
                            averageRating !== null ? (
                                <span className="flex items-center gap-2 text-sm text-gray-500">
                                    <StarRating rating={averageRating} />
                                    <span className="font-semibold text-gray-900">
                                        {averageRating.toFixed(1)}
                                    </span>
                                    / 5
                                </span>
                            ) : null
                        }
                    >
                        {reviews.length > 0 ? (
                            <ul className="flex flex-col divide-y divide-gray-100">
                                {reviews.map((review) => (
                                    <li
                                        key={review.id}
                                        className="py-4 first:pt-0 last:pb-0"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <StarRating
                                                rating={review.rating}
                                            />
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
                        ) : (
                            <p className="text-sm text-gray-400">
                                No reviews yet for this product.
                            </p>
                        )}
                    </Section>
                </div>

                <aside className="min-w-0 lg:col-span-4">
                    <div className="flex flex-col gap-6 lg:sticky lg:top-24">
                        <Card
                            className={classNames(
                                'rounded-2xl bg-gradient-to-br',
                                SURFACE,
                                theme.wash,
                            )}
                            bodyClass="flex flex-col gap-5 p-6"
                        >
                            <div className="flex items-center gap-4">
                                <span
                                    className={classNames(
                                        'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
                                        theme.solid,
                                    )}
                                >
                                    {StoreIcon ? (
                                        <StoreIcon
                                            aria-hidden
                                            className="h-6 w-6"
                                            strokeWidth={1.75}
                                        />
                                    ) : null}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
                                        Sold by
                                    </p>
                                    <p className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-gray-900">
                                        <span className="truncate">
                                            {storeName}
                                        </span>
                                        <BadgeCheck
                                            aria-hidden
                                            className="h-4 w-4 shrink-0 text-emerald-500"
                                        />
                                    </p>
                                    {store ? (
                                        <p className="text-sm text-gray-500">
                                            {store.tagline} ·{' '}
                                            <span
                                                className={classNames(
                                                    'font-medium',
                                                    theme.text,
                                                )}
                                            >
                                                {storeCount} item
                                                {storeCount === 1 ? '' : 's'}
                                            </span>
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <Button
                                block
                                className={SECONDARY_BUTTON_CLASS}
                                customColorClass={SECONDARY_BUTTON}
                                onClick={() =>
                                    goShop({ store: product.divisionId })
                                }
                            >
                                <span className="flex items-center justify-center gap-1">
                                    Visit {storeName} store
                                    <ChevronRight
                                        aria-hidden
                                        className="h-4 w-4"
                                    />
                                </span>
                            </Button>
                        </Card>

                        <Button
                            block
                            variant="plain"
                            className="!text-gray-500 hover:!text-emerald-700"
                            icon={<HiOutlineLink />}
                            onClick={shareLink}
                        >
                            Copy link to this product
                        </Button>
                    </div>
                </aside>
            </div>

            {/* RELATED */}
            <div className="mt-16 flex flex-col gap-16">
                <MarketplaceProductRow
                    id="similar-heading"
                    title={`More in ${product.category}`}
                    products={similar}
                    onViewAll={() => goShop({ category: product.category })}
                    renderCard={(p) => renderCard(p)}
                />
                <MarketplaceProductRow
                    id="store-heading"
                    title={`More from ${storeName}`}
                    products={fromStore}
                    onViewAll={() => goShop({ store: product.divisionId })}
                    renderCard={(p) => renderCard(p)}
                />
            </div>

            {/* MOBILE BOTTOM BAR */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-100 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur lg:hidden">
                <div className="mx-auto flex max-w-7xl items-center gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0">
                            <p
                                className={classNames(
                                    'truncate text-lg font-bold leading-tight',
                                    displayDiscount
                                        ? 'text-rose-600'
                                        : 'text-gray-900',
                                )}
                            >
                                {formatPrice(displayPrice)}
                            </p>
                            {displayDiscount ? (
                                <p className="truncate text-xs text-gray-400 line-through">
                                    {formatPrice(displayOriginalPrice!)}
                                </p>
                            ) : null}
                        </div>
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            onDecrease={() =>
                                setQuantity((q) => Math.max(1, q - 1))
                            }
                            onIncrease={() =>
                                setQuantity((q) =>
                                    Math.min(maxQuantity, q + 1),
                                )
                            }
                        />
                    </div>
                    <div className="ml-auto grid shrink-0 grid-cols-2 gap-2">
                        <Button
                            size="sm"
                            className="!rounded-lg border border-gray-200"
                            customColorClass={SECONDARY_BUTTON}
                            aria-label="Add to cart"
                            icon={<HiOutlineShoppingCart />}
                            disabled={addDisabled}
                            onClick={addToCart}
                        >
                            Add
                        </Button>
                        <Button
                            size="sm"
                            className="!rounded-lg border-0"
                            customColorClass={PRIMARY_BUTTON}
                            disabled={addDisabled}
                            onClick={buyNow}
                        >
                            {soldOut ? unavailableLabel : 'Buy now'}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    )
}

type MarketplaceProductPageProps = {
    divisionId: string
    sku: string
}

/** Full product page at /shop/<store>/<sku>, sharing the marketplace header, cart and checkout. */
const MarketplaceProductPage = ({
    divisionId,
    sku,
}: MarketplaceProductPageProps) => {
    const router = useRouter()
    const { catalog } = useMarketplace()
    const resetBrowse = useMarketplaceBrowseStore((s) => s.reset)

    const product = useMemo(
        () =>
            catalog.records.find(
                (p) => p.divisionId === divisionId && p.sku === sku,
            ) ?? null,
        [catalog.records, divisionId, sku],
    )

    return (
        <div className="min-h-screen bg-gray-50">
            <MarketplaceHeader />
            <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16">
                {product ? (
                    <ProductView key={productKey(product)} product={product} />
                ) : catalog.ready ? (
                    <ProductNotFound
                        onContinue={() => {
                            resetBrowse()
                            router.push(MARKETPLACE_PATH)
                        }}
                    />
                ) : catalog.error ? (
                    <StorefrontCatalogStatus
                        loading={false}
                        error={catalog.error}
                        empty={false}
                        onRetry={catalog.reload}
                    />
                ) : (
                    <ProductPageSkeleton />
                )}
            </main>
        </div>
    )
}

export default MarketplaceProductPage