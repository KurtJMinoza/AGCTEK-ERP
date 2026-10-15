'use client'

import { Heart, Tag } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import classNames from '@/utils/classNames'
import { productSellerLabel } from '@/modules/sd/utils/productSellerLabel'
import { productReviews } from './product/productContent'
import { productImageGallery } from '@/modules/sd/services/productCatalogService'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    StarRating,
    SURFACE,
    CompanyLogo,
    divisionTheme,
    SURFACE_HOVER,
    formatPrice,
} from '../marketplaceUi'

type MarketplaceProductCardProps = {
    product: SdProductRecord
    quantity: number
    favorite: boolean
    onOpen: () => void
    /** First add from the card (gated by sign-in and a confirmation). */
    onAdd: () => void
    /** "+" on a product already in the cart. */
    onIncrease: () => void
    onDecrease: () => void
    onToggleFavorite: () => void
}

export const discountPercent = (product: SdProductRecord) =>
    product.originalPrice !== null && product.originalPrice > product.price
        ? Math.round((1 - product.price / product.originalPrice) * 100)
        : null

const stopCardClick = {
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onKeyDown: (event: React.KeyboardEvent) => event.stopPropagation(),
}

const MarketplaceProductCard = ({
    product,
    quantity,
    favorite,
    onOpen,
    onAdd,
    onIncrease,
    onDecrease,
    onToggleFavorite,
}: MarketplaceProductCardProps) => {
    const discount = discountPercent(product)
    const reviews = productReviews(product)
    const averageRating = reviews.length
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : null
    // Hover swap only exists when the product has multiple photos.
    const gallery = productImageGallery(product)
    const hoverImage = gallery.length > 1 ? gallery[1] : null
    const IMAGE_SIZES =
        '(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 380px'
    return (
        <Card
            clickable
            role="button"
            tabIndex={0}
            aria-label={`View ${product.name}`}
            bodyClass="flex h-full flex-col gap-5 p-5 sm:p-6"
            className={classNames('h-full rounded-2xl', SURFACE, SURFACE_HOVER)}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    (event.key === 'Enter' || event.key === ' ')
                ) {
                    event.preventDefault()
                    onOpen()
                }
            }}
        >
            <div className="group relative overflow-hidden rounded-xl bg-white p-5">
                <ProductImage
                    product={product}
                    fit="contain"
                    sizes={IMAGE_SIZES}
                    className="aspect-square w-full !bg-transparent"
                />
                {/* Second photo fades in on hover when the product has a gallery. */}
                {hoverImage ? (
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 p-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    >
                        <ProductImage
                            product={{ imageUrl: hoverImage, name: product.name }}
                            fit="contain"
                            sizes={IMAGE_SIZES}
                            className="aspect-square w-full !bg-transparent"
                        />
                    </div>
                ) : null}
                {product.category ? (
                    <span className="absolute bottom-3 left-3 max-w-[55%] truncate rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 shadow-sm">
                        {product.category}
                    </span>
                ) : null}
                {product.badge ? (
                    <span className="absolute left-3 top-3 max-w-[65%] truncate rounded-md bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                        {product.badge}
                    </span>
                ) : null}
                <div className="absolute right-3 top-3" {...stopCardClick}>
                    <Button
                        size="xs"
                        shape="circle"
                        aria-pressed={favorite}
                        aria-label={
                            favorite
                                ? `Remove ${product.name} from favourites`
                                : `Add ${product.name} to favourites`
                        }
                        className="!h-8 !w-8 border border-gray-100 shadow-sm"
                        customColorClass={() =>
                            'bg-white text-gray-400 hover:text-rose-500'
                        }
                        icon={
                            <Heart
                                aria-hidden
                                className={classNames(
                                    'h-4 w-4',
                                    favorite && 'fill-rose-500 text-rose-500',
                                )}
                            />
                        }
                        onClick={onToggleFavorite}
                    />
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
                <span
                    className={classNames(
                        'flex min-w-0 items-center gap-1.5 truncate text-xs font-medium',
                        divisionTheme(product.divisionId).text,
                    )}
                >
                    {product.company ? (
                        <CompanyLogo company={product.company} size={18} />
                    ) : null}
                    <span className="truncate">
                        {productSellerLabel(product)}
                    </span>
                </span>
                <h3 className="line-clamp-2 min-h-[2.5rem] text-[15px] font-medium leading-snug text-gray-900">
                    {product.name}
                </h3>
                {product.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
                        {product.description}
                    </p>
                ) : null}
                <div className="mt-auto flex flex-col gap-2 pt-1">
                    {averageRating !== null ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StarRating rating={averageRating} />
                            <span className="text-xs font-semibold text-gray-700">
                                {averageRating.toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-400">
                                ({reviews.length} review{reviews.length === 1 ? '' : 's'})
                            </span>
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400">
                            No reviews yet
                        </span>
                    )}
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
                        <span
                            className={classNames(
                                'text-xl font-bold',
                                discount ? 'text-rose-600' : 'text-gray-900',
                            )}
                        >
                            {formatPrice(product.price)}
                        </span>
                        {product.originalPrice !== null ? (
                            <span className="text-sm text-gray-400 line-through">
                                {formatPrice(product.originalPrice)}
                            </span>
                        ) : null}
                    </div>
                    {discount && product.originalPrice !== null ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                                <Tag aria-hidden className="h-3 w-3" />
                                −{discount}%
                            </span>
                            <span className="text-xs font-medium text-shop-700">
                                You save{' '}
                                {formatPrice(
                                    product.originalPrice - product.price,
                                )}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            <div {...stopCardClick}>
                {quantity > 0 ? (
                    <div className="flex w-full items-center justify-between rounded-lg border border-shop-100 bg-shop-50 px-2 py-1">
                        <span className="text-xs font-medium text-shop-700">
                            In cart
                        </span>
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            onDecrease={onDecrease}
                            onIncrease={onIncrease}
                        />
                    </div>
                ) : (
                    <Button
                        block
                        className={PRIMARY_BUTTON_CLASS}
                        customColorClass={PRIMARY_BUTTON}
                        aria-label={`Add ${product.name} to cart`}
                        onClick={onAdd}
                    >
                        Add to Cart
                    </Button>
                )}
            </div>
        </Card>
    )
}

export default MarketplaceProductCard
