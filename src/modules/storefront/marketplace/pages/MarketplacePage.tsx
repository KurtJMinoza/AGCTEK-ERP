'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import Button from '@/components/ui/Button'
import { LPG_DIVISION_ID, isLpgAddon } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import MarketplaceCategoryGrid, {
    marketplaceCategories,
    type MarketplaceCategory,
} from '../components/MarketplaceCategoryGrid'
import MarketplaceOfficialStores from '../components/MarketplaceOfficialStores'
import MarketplaceHeader from '../components/MarketplaceHeader'
import { discountPercent } from '../components/MarketplaceProductCard'
import MarketplaceProductRow from '../components/MarketplaceProductRow'
import MarketplaceStorePromoCard, {
    type StorePromo,
} from '../components/MarketplaceStorePromoCard'
import { productsHref } from '../browseQuery'
import { useMarketplace } from '../MarketplaceProvider'
import {
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    SECTION_SUBTITLE,
    SECTION_TITLE,
    formatPrice,
} from '../marketplaceUi'
import {
    rememberReturnScroll,
    takeReturnScroll,
    useMarketplaceBrowseStore,
} from '../store/useMarketplaceBrowseStore'

const SHELF_SIZE = 12

const PROMO_PHOTOS = '/images/marketplace'

const lowestPrice = (products: SdProductRecord[]) =>
    products.length ? Math.min(...products.map((p) => p.price)) : null

const biggestDiscount = (products: SdProductRecord[]) =>
    Math.max(0, ...products.map((p) => discountPercent(p) ?? 0))

/** Featured-store card copy; offers are read from the live catalogue, never invented. */
const buildStorePromos = (records: SdProductRecord[]): StorePromo[] => {
    const refillFrom = lowestPrice(
        records.filter(
            (p) => p.divisionId === LPG_DIVISION_ID && !isLpgAddon(p),
        ),
    )
    const applianceDiscount = biggestDiscount(
        records.filter((p) => p.divisionId === APPLIANCES_DIVISION_ID),
    )
    return [
        {
            divisionId: RETAIL_DIVISION_ID,
            storeName: 'AWIC',
            eyebrow: 'AWIC Official Store',
            headline: '10% off',
            body: (
                <>
                    Health &amp; wellness picks. Use code{' '}
                    <span className="rounded-md border border-dashed border-white/60 bg-white/15 px-1.5 py-0.5 font-mono font-semibold text-white">
                        AWIC10
                    </span>{' '}
                    at checkout.
                </>
            ),
            cta: 'Shop AWIC',
            photos: [1, 2, 3].map(
                (n) => `${PROMO_PHOTOS}/awic-family-cooking-${n}.jpg`,
            ),
            shadeClass: 'from-emerald-950/90 via-emerald-900/55',
            eyebrowClass: 'text-amber-200',
            buttonClass:
                'bg-white text-emerald-700 hover:bg-amber-50 transition-colors',
        },
        {
            divisionId: LPG_DIVISION_ID,
            storeName: 'LPG',
            eyebrow: 'LPG Official Store',
            headline:
                refillFrom !== null
                    ? `LPG from ${formatPrice(refillFrom)}`
                    : 'LPG to your door',
            body: 'Gas refills, brand-new tanks and stove add-ons, delivered to your home. Pay cash on delivery.',
            cta: 'Shop LPG',
            photos: [
                `${PROMO_PHOTOS}/lpg-family-cooking-1.jpg`,
                `${PROMO_PHOTOS}/lpg-delivery-2.jpg`,
            ],
            shadeClass: 'from-orange-950/90 via-orange-900/50',
            eyebrowClass: 'text-orange-200',
            buttonClass:
                'bg-white text-orange-600 hover:bg-orange-50 transition-colors',
        },
        {
            divisionId: APPLIANCES_DIVISION_ID,
            storeName: 'MCONPINCO',
            eyebrow: 'MCONPINCO Official Store',
            headline:
                applianceDiscount > 0
                    ? `Up to ${applianceDiscount}% off`
                    : 'Home appliances',
            body: 'Refrigerators, washing machines and kitchen essentials for every Filipino home.',
            cta: 'Shop MCONPINCO',
            photos: [
                `${PROMO_PHOTOS}/mconpinco-family-fridge-1.jpg`,
                `${PROMO_PHOTOS}/mconpinco-laundry-2.jpg`,
            ],
            shadeClass: 'from-red-950/90 via-red-900/50',
            eyebrowClass: 'text-red-200',
            buttonClass:
                'bg-white text-red-600 hover:bg-red-50 transition-colors',
        },
    ]
}

const byDiscount = (products: SdProductRecord[]) =>
    [...products].sort(
        (a, b) => (discountPercent(b) ?? 0) - (discountPercent(a) ?? 0),
    )

/** Marketplace landing page; every "View all", store, category and search opens /shop/products. */
const MarketplacePage = () => {
    const router = useRouter()
    const {
        catalog,
        renderCard: renderProductCard,
        openProduct,
    } = useMarketplace()
    const setSearch = useMarketplaceBrowseStore((s) => s.setSearch)

    useEffect(() => {
        setSearch('')
    }, [setSearch])

    const restored = useRef(false)
    useEffect(() => {
        if (!catalog.ready || restored.current) return
        restored.current = true
        const top = takeReturnScroll()
        if (top !== null) requestAnimationFrame(() => window.scrollTo({ top }))
    }, [catalog.ready])

    const shelves = useMemo(() => {
        const ofDivision = (divisionId: string) =>
            catalog.records
                .filter((product) => product.divisionId === divisionId)
                .slice(0, SHELF_SIZE)
        const deals = byDiscount(
            catalog.records.filter((product) => discountPercent(product)),
        ).slice(0, SHELF_SIZE)
        return { deals, ofDivision }
    }, [catalog.records])

    const storePromos = useMemo(
        () => buildStorePromos(catalog.records),
        [catalog.records],
    )

    const shopCategories = useMemo(
        () => marketplaceCategories(catalog.records),
        [catalog.records],
    )

    const storeCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const product of catalog.records) {
            counts.set(
                product.divisionId,
                (counts.get(product.divisionId) ?? 0) + 1,
            )
        }
        return counts
    }, [catalog.records])

    const browse = (query: Parameters<typeof productsHref>[0] = {}) =>
        router.push(productsHref(query))

    const shopStore = (divisionId: string) => browse({ stores: [divisionId] })

    const shopCategory = (category: MarketplaceCategory) =>
        browse({
            stores: category.divisionId ? [category.divisionId] : [],
            categories: [category.name],
        })

    /** Opening a product remembers where the shopper was, for the way back. */
    const renderCard = (product: SdProductRecord) =>
        renderProductCard(product, (opened) => {
            rememberReturnScroll()
            openProduct(opened)
        })

    return (
        <div className="min-h-screen bg-gray-50">
            <MarketplaceHeader />

            <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
                    <section className="relative flex min-h-[18rem] overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50/60 p-8 shadow-sm sm:p-12 md:min-h-[26rem] lg:col-span-3">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl"
                        />
                        <ShoppingBag
                            aria-hidden
                            strokeWidth={1}
                            className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 text-emerald-100"
                        />
                        <div className="relative z-10 flex max-w-lg flex-col justify-center lg:w-2/3">
                            <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-700">
                                Three official stores · One cart
                            </span>
                            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-5xl md:text-4xl lg:text-5xl">
                                One Platform,{' '}
                                <span className="text-emerald-600">
                                    Everything You Need
                                </span>
                            </h1>
                            <p className="mt-4 text-sm leading-relaxed text-gray-500 sm:text-base">
                                Vitamins, bags, LPG refills and home appliances
                                from AWIC, LPG and MCONPINCO. Pay cash on
                                delivery.
                            </p>
                            <div className="mt-8">
                                <Button
                                    className={PRIMARY_BUTTON_CLASS}
                                    customColorClass={PRIMARY_BUTTON}
                                    onClick={() => browse()}
                                >
                                    Shop Now
                                </Button>
                            </div>
                        </div>
                    </section>

                    <MarketplaceStorePromoCard
                        promos={storePromos}
                        className="lg:col-span-2"
                        onShop={shopStore}
                    />
                </div>

                <div className="space-y-16 pt-16">
                    <section aria-labelledby="official-stores-heading">
                        <div className="mb-6">
                            <h2
                                id="official-stores-heading"
                                className={SECTION_TITLE}
                            >
                                Explore Official Brand Stores
                            </h2>
                            <p className={SECTION_SUBTITLE}>
                                Shop directly from AGC&apos;s verified
                                divisions.
                            </p>
                        </div>
                        <MarketplaceOfficialStores
                            counts={storeCounts}
                            activeDivisionId={null}
                            onSelect={shopStore}
                        />
                    </section>

                    <section aria-labelledby="categories-heading">
                        <div className="mb-6">
                            <h2
                                id="categories-heading"
                                className={SECTION_TITLE}
                            >
                                Explore Popular Categories
                            </h2>
                            <p className={SECTION_SUBTITLE}>
                                Find what you need across every store.
                            </p>
                        </div>
                        <MarketplaceCategoryGrid
                            activeCategory={null}
                            categories={shopCategories}
                            onSelect={shopCategory}
                        />
                    </section>

                    <MarketplaceProductRow
                        id="deals-heading"
                        title="Today's Best Deals"
                        products={shelves.deals}
                        onViewAll={() => browse({ sort: 'discount' })}
                        renderCard={renderCard}
                    />
                    <MarketplaceProductRow
                        id="appliances-heading"
                        title="Bestsellers In Home Appliances"
                        products={shelves.ofDivision(APPLIANCES_DIVISION_ID)}
                        onViewAll={() => shopStore(APPLIANCES_DIVISION_ID)}
                        renderCard={renderCard}
                    />
                    <MarketplaceProductRow
                        id="wellness-heading"
                        title="Health & Wellness"
                        products={shelves.ofDivision(RETAIL_DIVISION_ID)}
                        onViewAll={() => shopStore(RETAIL_DIVISION_ID)}
                        renderCard={renderCard}
                    />
                    <MarketplaceProductRow
                        id="energy-heading"
                        title="Energy & Gas Essentials"
                        products={shelves.ofDivision(LPG_DIVISION_ID)}
                        onViewAll={() => shopStore(LPG_DIVISION_ID)}
                        renderCard={renderCard}
                    />
                    <StorefrontCatalogStatus
                        loading={catalog.loading}
                        error={catalog.error}
                        empty={catalog.ready && catalog.records.length === 0}
                        onRetry={catalog.reload}
                    />

                    {catalog.ready && catalog.records.length > 0 ? (
                        <section className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60 px-6 py-12 text-center shadow-sm">
                            <h2 className={SECTION_TITLE}>
                                Looking for something else?
                            </h2>
                            <p className={SECTION_SUBTITLE}>
                                Browse all {catalog.records.length} products
                                from every official store.
                            </p>
                            <Button
                                className={PRIMARY_BUTTON_CLASS}
                                customColorClass={PRIMARY_BUTTON}
                                onClick={() => browse()}
                            >
                                View all products
                            </Button>
                        </section>
                    ) : null}
                </div>
            </main>
        </div>
    )
}

export default MarketplacePage
