'use client'

import { useState } from 'react'
import { HiOutlineExclamationCircle, HiOutlineShoppingCart } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Carousel, { type CarouselApi } from '@/components/ui/Carousel'
import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import type { LpgProduct } from '@/modules/sd/catalogs/lpgCatalog'
import {
    ORANGE_BUTTON,
    TAG_CLASS,
    LpgProductVisual,
    QuantityStepper,
    formatPrice,
} from './lpgUi'

const ProductGallery = ({ product }: { product: LpgProduct }) => {
    const slides: (string | null)[] = product.images?.length ? product.images : [null]
    const [api, setApi] = useState<CarouselApi>()
    const selectedIndex = api?.selectedIndex ?? 0
    const hasMany = slides.length > 1

    return (
        <div className="flex flex-col gap-3">
            <Carousel setApi={setApi} className="overflow-hidden rounded-2xl">
                <Carousel.Content>
                    {slides.map((src, index) => (
                        <Carousel.Item key={src ?? index} className="px-0">
                            <LpgProductVisual
                                product={product}
                                src={src}
                                size="lg"
                                className="aspect-square w-full rounded-2xl"
                            />
                        </Carousel.Item>
                    ))}
                </Carousel.Content>
                <Tag
                    className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${TAG_CLASS[product.category]}`}
                >
                    {product.category}
                </Tag>
                {hasMany ? (
                    <>
                        <Carousel.Previous className="absolute left-3 top-1/2 -translate-y-1/2" />
                        <Carousel.Next className="absolute right-3 top-1/2 -translate-y-1/2" />
                        <span className="absolute bottom-3 right-3 rounded-full bg-white/80 px-2 py-0.5 text-xs text-gray-600">
                            {selectedIndex + 1}/{slides.length}
                        </span>
                    </>
                ) : null}
            </Carousel>
            {hasMany ? (
                <div className="grid grid-cols-4 gap-2">
                    {slides.map((src, index) => (
                        <button
                            key={src ?? index}
                            type="button"
                            aria-label={`Show image ${index + 1}`}
                            className={classNames(
                                'overflow-hidden rounded-xl border-2',
                                index === selectedIndex
                                    ? 'border-orange-500'
                                    : 'border-transparent',
                            )}
                            onClick={() => api?.scrollTo(index)}
                        >
                            <LpgProductVisual
                                product={product}
                                src={src}
                                size="sm"
                                className="aspect-square w-full"
                            />
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

type LpgProductDetailProps = {
    product: LpgProduct
    addons: readonly LpgProduct[]
    cartHasRegularItem: boolean
    onAddToCart: (product: LpgProduct, quantity: number) => void
    onBuyNow: (product: LpgProduct, quantity: number) => void
}

const LpgProductDetail = ({
    product,
    addons,
    cartHasRegularItem,
    onAddToCart,
    onBuyNow,
}: LpgProductDetailProps) => {
    const [quantity, setQuantity] = useState(1)
    const showAddons = product.category !== 'Add-on' && addons.length > 0

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <ProductGallery product={product} />

            <div className="flex flex-col gap-5">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold text-orange-500 sm:text-2xl">
                            {product.name}
                        </h3>
                        <Tag className="rounded-full border-0 bg-gray-100 text-xs dark:bg-gray-700">
                            {product.sku}
                        </Tag>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {product.description}
                    </p>
                </div>

                <div>
                    <h6 className="mb-1 font-bold heading-text">What&apos;s included</h6>
                    <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
                        {product.includes.map((entry) => (
                            <li key={entry}>{entry}</li>
                        ))}
                    </ul>
                </div>

                {showAddons ? (
                    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                        <h6 className="font-bold heading-text">Add-ons</h6>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Choose accessories and extras to complete your order.
                        </p>
                        {!cartHasRegularItem ? (
                            <Tag className="mt-2 rounded-full border border-orange-300 bg-transparent text-xs text-orange-600">
                                Add a regular product to cart before checking out with add-ons
                            </Tag>
                        ) : null}
                        <ul className="mt-3 flex flex-col gap-2">
                            {addons.map((addon) => (
                                <li
                                    key={addon.sku}
                                    className="flex items-center gap-3 rounded-xl border border-gray-200 p-2 dark:border-gray-700"
                                >
                                    <LpgProductVisual
                                        product={addon}
                                        src={addon.images?.[0]}
                                        size="sm"
                                        className="h-14 w-14 shrink-0 rounded-lg"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold heading-text">
                                            {addon.name}
                                        </div>
                                        <div className="text-sm font-bold text-orange-500">
                                            {formatPrice(addon.basePrice)}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        className="text-orange-500"
                                        icon={<HiOutlineShoppingCart />}
                                        aria-label={`Add ${addon.name} to cart`}
                                        onClick={() => onAddToCart(addon, 1)}
                                    />
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                            <HiOutlineExclamationCircle className="shrink-0 text-orange-500" aria-hidden />
                            Add-ons cannot be ordered alone and need at least one regular item in your cart.
                        </p>
                    </div>
                ) : null}

                <div className="sticky bottom-0 -mx-1 mt-auto flex flex-col gap-3 border-t border-gray-200 bg-white px-1 pb-1 pt-4 dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <div className="text-xs font-semibold text-gray-500">Price</div>
                            <div className="text-2xl font-bold text-orange-500 sm:text-3xl">
                                {formatPrice(product.basePrice * quantity)}
                            </div>
                        </div>
                        <QuantityStepper
                            quantity={quantity}
                            label={product.name}
                            decreaseDisabled={quantity <= 1}
                            onDecrease={() => setQuantity((value) => Math.max(1, value - 1))}
                            onIncrease={() => setQuantity((value) => value + 1)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            block
                            variant="default"
                            className="border-orange-500 text-orange-500"
                            onClick={() => onAddToCart(product, quantity)}
                        >
                            Add to Cart
                        </Button>
                        <Button
                            block
                            variant="solid"
                            customColorClass={ORANGE_BUTTON}
                            onClick={() => onBuyNow(product, quantity)}
                        >
                            Buy now
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default LpgProductDetail
