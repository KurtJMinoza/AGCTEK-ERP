'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import CartDrawer from '@/components/storefront/retail/CartDrawer'
import ClientLoginDialog from '@/components/storefront/retail/ClientLoginDialog'
import StorefrontNavbar, {
    STOREFRONT_NAV,
} from '@/components/storefront/retail/Navbar'
import RetailProductCard from '@/components/storefront/retail/RetailProductCard'
import StorefrontLogo from '@/components/storefront/retail/StorefrontLogo'
import { fetchRetailProducts } from '@/services/storefront/retailService'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailCartSync } from '@/modules/storefront/retail/hooks/useRetailCartSync'
import { AWIC_BRAND, getSeptemberSalePrice } from '@/modules/storefront/retail/brand'
import classNames from '@/utils/classNames'
import type {
    RetailCatalogCategoryFilter,
    RetailProduct,
} from '@/types/storefront/retail'

function matchesCategoryFilter(
    product: RetailProduct,
    filter: RetailCatalogCategoryFilter,
): boolean {
    if (filter === 'all') return true
    if (filter === 'vitamins') return product.category === 'Vitamins'
    if (filter === 'bags') return product.category === 'Bags'
    return (
        product.category === 'General Goods' ||
        product.category === 'Accessories'
    )
}

function SectionHeading({
    title,
    eyebrow,
}: {
    title: string
    eyebrow?: string
}) {
    return (
        <div className="mb-12 flex flex-col gap-4 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {eyebrow ? (
                    <p className="mb-3 font-storefront-body text-sm font-medium tracking-wide text-brand-gold">
                        {eyebrow}
                    </p>
                ) : null}
                <h2 className="font-storefront-heading text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">
                    {title}
                </h2>
            </div>
            <div className="hidden h-px w-28 bg-brand-gold sm:block" />
        </div>
    )
}

function CatalogSection({
    title,
    eyebrow,
    children,
    tone = 'canvas',
}: {
    title: string
    eyebrow?: string
    children: ReactNode
    tone?: 'canvas' | 'sage'
}) {
    return (
        <section
            className={classNames(
                'px-6 py-20 lg:px-10 lg:py-24',
                tone === 'sage' ? 'bg-brand-sage' : 'bg-brand-canvas',
            )}
        >
            <div className="mx-auto max-w-[1320px]">
                <SectionHeading title={title} eyebrow={eyebrow} />
                {children}
            </div>
        </section>
    )
}

function ProductGrid({
    products,
    animate = false,
    badge,
    salePricing = false,
}: {
    products: RetailProduct[]
    animate?: boolean
    badge?: string
    /** Apply September Sale discounted pricing display */
    salePricing?: boolean
}) {
    return (
        <div className="grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-4 md:gap-x-8 md:gap-y-16">
            {products.map((product, index) => {
                const salePrice = salePricing
                    ? getSeptemberSalePrice(product.basePrice)
                    : undefined
                return animate ? (
                    <motion.div
                        key={product.itemId}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-60px' }}
                        transition={{ duration: 0.5, delay: index * 0.05 }}
                    >
                        <RetailProductCard
                            product={product}
                            badge={badge}
                            salePrice={salePrice}
                        />
                    </motion.div>
                ) : (
                    <RetailProductCard
                        key={product.itemId}
                        product={product}
                        badge={badge}
                        salePrice={salePrice}
                    />
                )
            })}
        </div>
    )
}

export default function RetailShopPage() {
    const [products, setProducts] = useState<RetailProduct[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [category, setCategory] =
        useState<RetailCatalogCategoryFilter>('all')

    useRetailCartSync()

    const openDrawer = useRetailCartStore((state) => state.openDrawer)
    const cartCount = useRetailCartStore((state) => state.itemCount())

    useEffect(() => {
        let active = true
        fetchRetailProducts()
            .then((data) => {
                if (active) setProducts(data)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return products
            .filter((product) => matchesCategoryFilter(product, category))
            .filter(
                (product) =>
                    !q ||
                    product.name.toLowerCase().includes(q) ||
                    product.sku.toLowerCase().includes(q),
            )
            .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    }, [products, query, category])

    const vitamins = filtered.filter((p) => p.category === 'Vitamins')
    const bags = filtered.filter((p) => p.category === 'Bags')
    const goods = filtered.filter(
        (p) =>
            p.category === 'General Goods' || p.category === 'Accessories',
    )
    const showSections = category === 'all' && !query.trim()
    const featuredBag = bags[0]
    const featuredVitamin = vitamins[0]
    const septemberSale = useMemo(() => {
        const byCategory = (cat: RetailProduct['category']) =>
            filtered.filter((p) => p.category === cat)
        const picks: RetailProduct[] = []
        const pushUnique = (product: RetailProduct | undefined) => {
            if (!product) return
            if (picks.some((p) => p.itemId === product.itemId)) return
            picks.push(product)
        }
        byCategory('Bags').slice(0, 2).forEach(pushUnique)
        byCategory('Vitamins').slice(0, 2).forEach(pushUnique)
        byCategory('Accessories').slice(0, 1).forEach(pushUnique)
        byCategory('General Goods').slice(0, 1).forEach(pushUnique)
        for (const product of filtered) {
            if (picks.length >= 8) break
            pushUnique(product)
        }
        return picks.slice(0, 8)
    }, [filtered])

    const scrollToCatalog = () => {
        const target =
            document.getElementById('september-sale') ??
            document.getElementById('catalog')
        target?.scrollIntoView({ behavior: 'smooth' })
    }

    const handleHome = () => {
        setCategory('all')
        setQuery('')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <div className="min-h-screen bg-brand-canvas text-brand-ink">
            <StorefrontNavbar
                category={category}
                onCategoryChange={setCategory}
                query={query}
                onQueryChange={setQuery}
                cartCount={cartCount}
                onOpenCart={openDrawer}
                onHome={handleHome}
                onScrollToCatalog={scrollToCatalog}
            />

            {/* Immersive hero */}
            <section className="relative flex min-h-[86vh] items-end overflow-hidden bg-brand-deep px-6 pb-16 pt-28 lg:px-10 lg:pb-20">
                <Image
                    src="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=2000&q=80"
                    alt=""
                    fill
                    priority
                    className="object-cover opacity-40"
                    sizes="100vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-deep via-brand-deep/75 to-brand-deep/35" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(201,168,76,0.22),transparent_50%)]" />

                <motion.div
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.75, ease: 'easeOut' }}
                    className="relative z-[1] mx-auto flex w-full max-w-[1320px] flex-col items-start gap-8 md:flex-row md:items-end md:justify-between"
                >
                    <div className="max-w-xl">
                        <StorefrontLogo size="lg" priority />
                        <p className="mt-6 font-storefront-body text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
                            {AWIC_BRAND.initials} · {AWIC_BRAND.shortName}
                        </p>
                        <h1 className="mt-3 font-storefront-heading text-4xl font-semibold leading-[1.12] tracking-tight text-brand-canvas sm:text-5xl md:text-6xl">
                            {AWIC_BRAND.fullName}
                        </h1>
                        <p className="mt-5 max-w-md font-storefront-body text-lg leading-relaxed text-brand-canvas/75">
                            Bags, vitamins, and goods that travel light —
                            curated retail from {AWIC_BRAND.shortName}.
                        </p>
                        <div className="mt-9 flex flex-wrap items-center gap-4">
                            <button
                                type="button"
                                onClick={scrollToCatalog}
                                className="bg-brand-gold px-9 py-3.5 font-storefront-body text-sm font-semibold text-brand-deep transition-all hover:bg-brand-gold-soft hover:shadow-[0_12px_30px_rgba(201,168,76,0.35)]"
                            >
                                Shop now
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCategory('bags')
                                    scrollToCatalog()
                                }}
                                className="border border-brand-gold-soft/50 px-7 py-3.5 font-storefront-body text-sm font-medium text-brand-gold-soft transition-colors hover:border-brand-gold hover:text-brand-gold"
                            >
                                Explore bags
                            </button>
                        </div>
                    </div>

                    <div className="hidden w-full max-w-xs border border-brand-gold/25 bg-brand-deep/50 p-6 backdrop-blur-md md:block">
                        <p className="font-storefront-body text-sm font-medium text-brand-gold">
                            This season
                        </p>
                        <p className="mt-3 font-storefront-body text-base leading-relaxed text-brand-canvas/80">
                            Heritage carry, daily essentials, and soft
                            finishes — designed to feel premium without the
                            noise.
                        </p>
                    </div>
                </motion.div>
            </section>

            {/* September Sale — lead hook */}
            {!loading && showSections && septemberSale.length > 0 ? (
                <section
                    id="september-sale"
                    className="relative overflow-hidden bg-brand-deep px-6 py-20 lg:px-10 lg:py-24"
                >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(201,168,76,0.28),transparent_45%),radial-gradient(ellipse_at_90%_80%,rgba(201,168,76,0.12),transparent_40%)]" />
                    <div className="relative mx-auto max-w-[1320px]">
                        <div className="mb-12 flex flex-col gap-4 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="mb-3 font-storefront-body text-sm font-semibold uppercase tracking-[0.18em] text-brand-gold">
                                    Limited time
                                </p>
                                <h2 className="font-storefront-heading text-3xl font-semibold tracking-tight text-brand-canvas md:text-5xl">
                                    September Sale!
                                </h2>
                                <p className="mt-4 max-w-md font-storefront-body text-base leading-relaxed text-brand-canvas/65">
                                    Highlighted picks across bags, vitamins,
                                    and goods — curated for this month.
                                </p>
                            </div>
                            <div className="hidden h-px w-28 bg-brand-gold sm:block" />
                        </div>
                        <div className="[&_h3]:text-brand-canvas [&_p]:text-brand-gold">
                            <ProductGrid
                                products={septemberSale}
                                animate
                                badge="Sale"
                                salePricing
                            />
                        </div>
                    </div>
                </section>
            ) : null}

            {/* Featured products */}
            {!loading && showSections && (featuredBag || featuredVitamin) ? (
                <section className="bg-brand-canvas px-6 py-16 lg:px-10 lg:py-20">
                    <div className="mx-auto max-w-[1320px]">
                        <SectionHeading
                            title="Featured products"
                            eyebrow="Editor's picks"
                        />
                        <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                            {featuredBag ? (
                                <Link
                                    href={`/awic/${encodeURIComponent(featuredBag.sku)}`}
                                    className="group relative min-h-[360px] overflow-hidden text-left md:min-h-[440px]"
                                >
                                    <Image
                                        src={featuredBag.imageUrl}
                                        alt={featuredBag.name}
                                        fill
                                        unoptimized={featuredBag.imageUrl.endsWith(
                                            '.svg',
                                        )}
                                        className="object-cover transition duration-700 group-hover:scale-105"
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-brand-deep/25 to-transparent" />
                                    <div className="absolute inset-x-0 bottom-0 p-7">
                                        <p className="font-storefront-body text-sm font-medium text-brand-gold">
                                            Featured · Bags
                                        </p>
                                        <h3 className="mt-2 font-storefront-heading text-2xl font-semibold tracking-tight text-brand-canvas md:text-3xl">
                                            {featuredBag.name}
                                        </h3>
                                        <p className="mt-3 inline-flex bg-brand-gold px-4 py-2.5 font-storefront-body text-sm font-semibold text-brand-deep">
                                            View details
                                        </p>
                                    </div>
                                </Link>
                            ) : null}
                            {featuredVitamin ? (
                                <Link
                                    href={`/awic/${encodeURIComponent(featuredVitamin.sku)}`}
                                    className="group relative min-h-[360px] overflow-hidden text-left md:min-h-[440px]"
                                >
                                    <Image
                                        src={featuredVitamin.imageUrl}
                                        alt={featuredVitamin.name}
                                        fill
                                        unoptimized={featuredVitamin.imageUrl.endsWith(
                                            '.svg',
                                        )}
                                        className="object-cover transition duration-700 group-hover:scale-105"
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-brand-deep/25 to-transparent" />
                                    <div className="absolute inset-x-0 bottom-0 p-7">
                                        <p className="font-storefront-body text-sm font-medium text-brand-gold">
                                            Featured · Vitamins
                                        </p>
                                        <h3 className="mt-2 font-storefront-heading text-2xl font-semibold tracking-tight text-brand-canvas md:text-3xl">
                                            {featuredVitamin.name}
                                        </h3>
                                        <p className="mt-3 inline-flex bg-brand-gold px-4 py-2.5 font-storefront-body text-sm font-semibold text-brand-deep">
                                            View details
                                        </p>
                                    </div>
                                </Link>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : null}

            <main id="catalog">
                {loading ? (
                    <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-5 px-6 py-20 md:grid-cols-4 md:gap-8 lg:px-10">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div
                                key={index}
                                className="aspect-[4/5] animate-pulse bg-brand-sage"
                            />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-6 py-28 text-center">
                        <p className="font-storefront-body text-base text-brand-ink">
                            Nothing here yet
                        </p>
                        <button
                            type="button"
                            className="mt-4 font-storefront-body text-sm font-semibold text-brand-gold underline underline-offset-4"
                            onClick={() => {
                                setCategory('all')
                                setQuery('')
                            }}
                        >
                            Clear filters
                        </button>
                    </div>
                ) : showSections ? (
                    <>
                        {/* Mid-page statement */}
                        <section className="relative overflow-hidden bg-brand-ink px-6 py-20 text-center lg:px-10 lg:py-24">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,168,76,0.18),transparent_60%)]" />
                            <div className="relative mx-auto max-w-2xl">
                                <p className="font-storefront-body text-sm font-medium text-brand-gold">
                                    The {AWIC_BRAND.initials} standard
                                </p>
                                <h2 className="mt-5 font-storefront-heading text-3xl font-semibold tracking-tight text-brand-canvas md:text-4xl">
                                    Crafted to feel premium.
                                    <span className="mt-2 block text-brand-gold-soft">
                                        Priced for everyday.
                                    </span>
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCategory('all')
                                        scrollToCatalog()
                                    }}
                                    className="mt-10 border border-brand-gold px-8 py-3.5 font-storefront-body text-sm font-semibold text-brand-gold transition-colors hover:bg-brand-gold hover:text-brand-deep"
                                >
                                    View all products
                                </button>
                            </div>
                        </section>

                        {bags.length > 0 ? (
                            <CatalogSection
                                title="Bags"
                                eyebrow="Carry well"
                                tone="sage"
                            >
                                <ProductGrid
                                    products={bags}
                                />
                            </CatalogSection>
                        ) : null}

                        {vitamins.length > 0 ? (
                            <CatalogSection
                                title="Vitamins"
                                eyebrow="Daily ritual"
                                tone="canvas"
                            >
                                <ProductGrid
                                    products={vitamins}
                                />
                            </CatalogSection>
                        ) : null}

                        {goods.length > 0 ? (
                            <CatalogSection
                                title="General goods"
                                eyebrow="The extras"
                                tone="sage"
                            >
                                <ProductGrid
                                    products={goods}
                                />
                            </CatalogSection>
                        ) : null}
                    </>
                ) : (
                    <div className="mx-auto max-w-[1320px] px-6 py-20 lg:px-10">
                        <SectionHeading
                            title={
                                STOREFRONT_NAV.find((n) => n.id === category)
                                    ?.label ?? 'Shop'
                            }
                            eyebrow="Collection"
                        />
                        <ProductGrid
                            products={filtered}
                        />
                    </div>
                )}
            </main>

            <footer className="border-t border-brand-gold/20 bg-brand-deep text-brand-canvas">
                <div className="mx-auto grid max-w-[1320px] gap-12 px-6 py-16 md:grid-cols-3 lg:px-10">
                    <div className="md:col-span-2">
                        <StorefrontLogo size="lg" withWordmark tone="onDark" />
                        <p className="mt-5 max-w-md font-storefront-body text-sm leading-relaxed text-brand-canvas/55">
                            {AWIC_BRAND.fullName} — omnichannel retail for
                            everyday carry, wellness, and goods done with
                            intention.
                        </p>
                    </div>
                    <div className="flex flex-col justify-end gap-3 md:items-end">
                        <p className="font-storefront-body text-sm font-medium text-brand-gold">
                            Stay close
                        </p>
                        <p className="font-storefront-body text-base text-brand-canvas/60">
                            Shop · Vitamins · Bags · Goods
                        </p>
                        <p className="mt-4 font-storefront-body text-sm text-brand-gold-soft">
                            {AWIC_BRAND.initials} · {AWIC_BRAND.shortName}
                        </p>
                    </div>
                </div>
            </footer>

            <CartDrawer />
            <ClientLoginDialog />
        </div>
    )
}
