import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowLeft,
    CheckCircle2,
    ShieldCheck,
    Truck,
    RotateCcw,
    Sparkles,
    ShoppingCart,
} from 'lucide-react'
import { resolveErpApiBaseUrl } from '@/configs/app.config'
import { auth } from '@/auth'
import CustomerReviewsSection from '@/components/reviews/CustomerReviewsSection'

type ProductPageProps = {
    params: Promise<{ id: string }>
}

interface ProductDetail {
    id: string
    sku: string
    name: string
    description: string
    price: string | number
    originalPrice?: string | number | null
    category: string
    imageUrl: string
    badge?: string | null
    isActive: boolean
    status: string
    attributes?: {
        brand?: string
        specs?: Array<{ label: string; value: string }>
        tagline?: string
        warranty?: string
        inclusions?: string[]
        keyFeatures?: string[]
        images?: string[]
    }
}

async function getProduct(id: string): Promise<ProductDetail | null> {
    try {
        const baseUrl = resolveErpApiBaseUrl()
        const res = await fetch(`${baseUrl}/sd/products/${encodeURIComponent(id)}`, {
            cache: 'no-store',
        })
        if (!res.ok) return null
        return (await res.json()) as ProductDetail
    } catch {
        return null
    }
}

async function checkReviewEligibility(
    productId: string,
    userId?: string,
): Promise<boolean> {
    if (!userId) return false
    try {
        const baseUrl = resolveErpApiBaseUrl()
        const res = await fetch(
            `${baseUrl}/reviews/eligibility?productId=${encodeURIComponent(productId)}&userId=${encodeURIComponent(userId)}`,
            {
                headers: {
                    'x-user-id': userId,
                    Accept: 'application/json',
                },
                cache: 'no-store',
            },
        )
        if (!res.ok) return false
        const data = (await res.json()) as { eligible?: boolean }
        return data.eligible === true
    } catch {
        return false
    }
}

async function getProductReviews(productId: string) {
    try {
        const baseUrl = resolveErpApiBaseUrl()
        const res = await fetch(
            `${baseUrl}/reviews?productId=${encodeURIComponent(productId)}`,
            { cache: 'no-store' },
        )
        if (!res.ok) return []
        const data = await res.json()
        return data.reviews || []
    } catch {
        return []
    }
}

export async function generateMetadata({
    params,
}: ProductPageProps): Promise<Metadata> {
    const { id } = await params
    const product = await getProduct(id)
    if (!product) {
        return {
            title: 'Product Not Found | AGCTEK Storefront',
        }
    }
    return {
        title: `${product.name} | Customer Reviews & Details`,
        description:
            product.description ||
            `Read real customer reviews and buy ${product.name} online at AGCTEK Storefront.`,
    }
}

export default async function ProductPage({ params }: ProductPageProps) {
    const { id } = await params
    const product = await getProduct(id)

    if (!product) {
        notFound()
    }

    const session = await auth()
    const userId = (session?.user as { id?: string } | undefined)?.id
    const [canReview, initialReviews] = await Promise.all([
        checkReviewEligibility(product.id, userId),
        getProductReviews(product.id),
    ])

    const priceNumber = Number(product.price)
    const originalPriceNumber = product.originalPrice
        ? Number(product.originalPrice)
        : null
    const discountPercent =
        originalPriceNumber && originalPriceNumber > priceNumber
            ? Math.round(
                  ((originalPriceNumber - priceNumber) / originalPriceNumber) *
                      100,
              )
            : null

    const keyFeatures =
        product.attributes?.keyFeatures ||
        (product.description ? [product.description] : [])

    return (
        <main className="min-h-screen bg-gray-50/60 pb-16 pt-6">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                {/* Navigation Breadcrumb */}
                <nav
                    aria-label="Breadcrumb"
                    className="mb-6 flex items-center justify-between"
                >
                    <ol className="flex items-center gap-2 text-xs text-gray-500">
                        <li>
                            <Link
                                href="/shop"
                                className="hover:text-emerald-700 transition-colors"
                            >
                                Home
                            </Link>
                        </li>
                        <li className="text-gray-300">/</li>
                        <li>
                            <Link
                                href="/shop/products"
                                className="hover:text-emerald-700 transition-colors"
                            >
                                Products
                            </Link>
                        </li>
                        <li className="text-gray-300">/</li>
                        <li
                            className="font-medium text-gray-900 truncate max-w-[200px] sm:max-w-md"
                            aria-current="page"
                        >
                            {product.name}
                        </li>
                    </ol>

                    <Link
                        href="/shop"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to Shop
                    </Link>
                </nav>

                {/* Product Detail Card */}
                <section
                    aria-labelledby="product-title"
                    className="mb-10 rounded-2xl bg-white p-6 sm:p-8 shadow-sm border border-gray-100"
                >
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-12 lg:gap-12">
                        {/* Left: Product Image */}
                        <div className="md:col-span-5 flex flex-col items-center">
                            <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                                {product.imageUrl ? (
                                    <Image
                                        src={product.imageUrl}
                                        alt={product.name}
                                        fill
                                        priority
                                        className="object-cover object-center"
                                        sizes="(max-width: 768px) 100vw, 420px"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">
                                        No Image Available
                                    </div>
                                )}
                                {product.badge && (
                                    <span className="absolute top-3 left-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                                        {product.badge}
                                    </span>
                                )}
                            </div>

                            {/* Small perks */}
                            <div className="mt-6 grid w-full grid-cols-3 gap-2 border-t border-gray-100 pt-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                    <Truck className="h-4 w-4 text-emerald-600" />
                                    <span className="text-[11px] font-medium text-gray-600">
                                        Fast Delivery
                                    </span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                    <span className="text-[11px] font-medium text-gray-600">
                                        Genuine Item
                                    </span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <RotateCcw className="h-4 w-4 text-emerald-600" />
                                    <span className="text-[11px] font-medium text-gray-600">
                                        7-Day Returns
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Right: Info & Purchase actions */}
                        <div className="md:col-span-7 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                        {product.category || 'General'}
                                    </span>
                                    <span className="text-xs text-gray-400 font-mono">
                                        SKU: {product.sku}
                                    </span>
                                </div>

                                <h1
                                    id="product-title"
                                    className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-snug"
                                >
                                    {product.name}
                                </h1>

                                {product.attributes?.tagline && (
                                    <p className="mt-1 text-sm font-medium text-emerald-700">
                                        {product.attributes.tagline}
                                    </p>
                                )}

                                {/* Jump to Reviews Link */}
                                <div className="mt-3 flex items-center gap-2">
                                    <a
                                        href="#customer-reviews"
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Read Customer Reviews Below
                                    </a>
                                </div>

                                {/* Pricing Box */}
                                <div className="mt-5 rounded-xl bg-gray-50/90 p-4 border border-gray-100">
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-3xl font-black text-gray-900 tracking-tight">
                                            ₱{priceNumber.toLocaleString('en-PH', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        {originalPriceNumber && (
                                            <span className="text-sm font-medium text-gray-400 line-through">
                                                ₱{originalPriceNumber.toLocaleString(
                                                    'en-PH',
                                                    {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    },
                                                )}
                                            </span>
                                        )}
                                        {discountPercent !== null && (
                                            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-600">
                                                -{discountPercent}%
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1 font-medium">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        In Stock & Ready for Dispatch
                                    </p>
                                </div>

                                {/* Key Features list */}
                                {keyFeatures.length > 0 && (
                                    <div className="mt-5">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                                            Key Features
                                        </h3>
                                        <ul className="space-y-1.5">
                                            {keyFeatures.map((feat, idx) => (
                                                <li
                                                    key={idx}
                                                    className="flex items-start gap-2 text-xs text-gray-600"
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                                    <span>{feat}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Order CTA bar */}
                            <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-3">
                                <Link
                                    href={`/shop`}
                                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    Order via Marketplace
                                </Link>
                                <a
                                    href="#customer-reviews"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                    View Reviews
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Customer Reviews Section */}
                <CustomerReviewsSection
                    productId={product.id}
                    productName={product.name}
                    canReview={canReview}
                    initialReviews={initialReviews}
                />
            </div>
        </main>
    )
}
