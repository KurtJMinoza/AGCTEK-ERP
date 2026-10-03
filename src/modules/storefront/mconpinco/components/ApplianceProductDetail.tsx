'use client'

import { useState } from 'react'
import Image from 'next/image'
import { HiMinus, HiOutlineShoppingCart, HiPlus } from 'react-icons/hi'
import { CreditCard, PackageCheck, ShieldCheck, Truck } from 'lucide-react'
import { isUnoptimizedImage } from '@/utils/productImage'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import type { ApplianceProduct } from '@/modules/sd/catalogs/mconpincoCatalog'
import {
    ADD_TO_CART_BUTTON,
    DARK_BUTTON,
    discountPercent,
    formatPrice,
} from './mconpincoUi'

type ApplianceProductDetailProps = {
    product: ApplianceProduct
    onAddToCart: (product: ApplianceProduct, quantity: number) => void
    onBuyNow: (product: ApplianceProduct, quantity: number) => void
}

const SectionHeading = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-3 border-b border-gray-200 pb-2 dark:border-gray-700">
        <h4 className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">
            {title}
        </h4>
        {subtitle ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
    </div>
)

const ApplianceProductDetail = ({
    product,
    onAddToCart,
    onBuyNow,
}: ApplianceProductDetailProps) => {
    const [quantity, setQuantity] = useState(1)
    const discount = discountPercent(product)

    return (
        <div className="flex flex-col gap-8">
            <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:gap-8">
                <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <Image
                        src={product.imageUrl}
                        alt={product.name}
                        width={640}
                        height={640}
                        sizes="(max-width: 768px) 100vw, 520px"
                        unoptimized={isUnoptimizedImage(product.imageUrl)}
                        className="aspect-square h-auto w-full object-cover"
                    />
                    {product.brand && (
                        <span className="absolute left-4 top-4 rounded-md bg-white/90 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-gray-900 shadow-sm dark:bg-gray-900/90 dark:text-gray-100">
                            {product.brand}
                        </span>
                    )}
                    {discount !== null && (
                        <span
                            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-sm font-extrabold text-white shadow-md"
                            aria-label={`${discount}% off`}
                        >
                            -{discount}%
                        </span>
                    )}
                </div>

                <div className="flex flex-col">
                    <h3 className="text-2xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-3xl dark:text-white">
                        {product.name}
                    </h3>
                    <p className="mt-1 text-base font-medium text-gray-700 dark:text-gray-300">
                        {product.tagline}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">SKU: {product.sku}</p>

                    <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
                        <span className="text-3xl font-extrabold tracking-tight text-red-600 dark:text-red-500">
                            {formatPrice(product.basePrice)}
                        </span>
                        {product.originalPrice && (
                            <span className="text-lg text-gray-400 line-through dark:text-gray-500">
                                {formatPrice(product.originalPrice)}
                            </span>
                        )}
                    </div>
                    {product.originalPrice && (
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            You save {formatPrice(product.originalPrice - product.basePrice)}
                        </p>
                    )}

                    {product.badge && (
                        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Exclusive offer
                            </div>
                            <Tag className="mt-2 rounded-full border-0 bg-gray-900 px-3 py-1 text-xs font-semibold text-white dark:bg-gray-700">
                                {product.badge}
                            </Tag>
                        </div>
                    )}

                    <div className="mt-5 flex items-center gap-4">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Quantity
                        </span>
                        <div className="flex items-center rounded-full border border-gray-200 p-1 dark:border-gray-600">
                            <Button
                                size="xs"
                                shape="circle"
                                variant="plain"
                                icon={<HiMinus />}
                                aria-label={`Decrease ${product.name} quantity`}
                                disabled={quantity <= 1}
                                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                            />
                            <span className="w-10 text-center font-bold text-gray-900 dark:text-gray-100">
                                {quantity}
                            </span>
                            <Button
                                size="xs"
                                shape="circle"
                                variant="plain"
                                icon={<HiPlus />}
                                aria-label={`Increase ${product.name} quantity`}
                                onClick={() => setQuantity((value) => value + 1)}
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                        <Button
                            block
                            variant="solid"
                            className="font-bold uppercase tracking-wide"
                            customColorClass={ADD_TO_CART_BUTTON}
                            icon={<HiOutlineShoppingCart />}
                            onClick={() => onAddToCart(product, quantity)}
                        >
                            Add to Cart
                        </Button>
                        <Button
                            block
                            variant="solid"
                            className="font-bold uppercase tracking-wide"
                            customColorClass={DARK_BUTTON}
                            onClick={() => onBuyNow(product, quantity)}
                        >
                            Buy it now
                        </Button>
                    </div>

                    <ul className="mt-5 flex flex-col gap-3 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-800/60">
                        <li className="flex items-start gap-3">
                            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-gray-700 dark:text-gray-300" aria-hidden />
                            <span className="text-gray-700 dark:text-gray-300">
                                <span className="font-semibold text-gray-900 dark:text-gray-100">Fast delivery in Mindanao</span>
                                {' '}· Flat delivery fee at checkout
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-700 dark:text-gray-300" aria-hidden />
                            <span className="text-gray-700 dark:text-gray-300">
                                <span className="font-semibold text-gray-900 dark:text-gray-100">Warranty</span>
                                {' '}· {product.warranty || 'Official brand warranty'}
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-700 dark:text-gray-300" aria-hidden />
                            <span className="text-gray-700 dark:text-gray-300">
                                <span className="font-semibold text-gray-900 dark:text-gray-100">Cash on delivery</span>
                                {' '}· Pay when your order arrives
                            </span>
                        </li>
                    </ul>
                </div>
            </div>

            {product.keyFeatures.length > 0 && (
            <section>
                <SectionHeading title="Product Specifications" subtitle="Key features" />
                <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {product.keyFeatures.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                            {feature}
                        </li>
                    ))}
                </ul>
            </section>
            )}

            {(product.specs.length > 0 || product.inclusions.length > 0) && (
            <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
                <section>
                    <SectionHeading title="Specifications" />
                    <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 dark:divide-gray-700 dark:border-gray-700">
                        {product.specs.map((spec) => (
                            <div key={spec.label} className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm odd:bg-gray-50 dark:odd:bg-gray-800/60">
                                <dt className="text-gray-500 dark:text-gray-400">{spec.label}</dt>
                                <dd className="font-medium text-gray-900 dark:text-gray-100">{spec.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section>
                    <SectionHeading title="What's in the box" />
                    <ul className="flex flex-col gap-2">
                        {product.inclusions.map((item) => (
                            <li key={item} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <PackageCheck className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
                                {item}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
            )}
        </div>
    )
}

export default ApplianceProductDetail
