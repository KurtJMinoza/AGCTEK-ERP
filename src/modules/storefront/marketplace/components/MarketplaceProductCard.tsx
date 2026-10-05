'use client'

import { Heart } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import classNames from '@/utils/classNames'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    ProductImage,
    QuantityStepper,
    StarRating,
    SURFACE,
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
    return (
        <Card
            clickable
            role="button"
            tabIndex={0}
            aria-label={`View ${product.name}`}
            bodyClass="flex h-full flex-col gap-5 p-5"
            className={classNames('h-full rounded-xl', SURFACE, SURFACE_HOVER)}
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
            <div className="relative overflow-hidden rounded-lg bg-gray-50 p-4">
                <ProductImage
                    product={product}
                    fit="contain"
                    sizes="(max-width: 768px) 45vw, 288px"
                    className="aspect-square w-full !bg-transparent"
                />
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

            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <span
                    className={classNames(
                        'truncate text-xs font-medium',
                        divisionTheme(product.divisionId).text,
                    )}
                >
                    {productDivisionLabel(product.divisionId)}
                </span>
                <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-gray-900">
                    {product.name}
                </h3>
                <div className="mt-auto flex flex-col gap-2 pt-1">
                    <StarRating />
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
                        <span
                            className={classNames(
                                'text-lg font-bold',
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
                        {discount ? (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-600">
                                −{discount}%
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            <div {...stopCardClick}>
                {quantity > 0 ? (
                    <div className="flex w-full items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1">
                        <span className="text-xs font-medium text-emerald-700">
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
