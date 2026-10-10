'use client'

import {
    Fragment,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HiOutlineAdjustments, HiOutlineSearch, HiX } from 'react-icons/hi'
import { BadgeCheck, Building2, LayoutGrid } from 'lucide-react'
import Breadcrumb from '@/components/shared/Breadcrumb'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Drawer from '@/components/ui/Drawer'
import Select from '@/components/ui/Select'
import Skeleton from '@/components/ui/Skeleton'
import classNames from '@/utils/classNames'
import useResponsive from '@/utils/hooks/useResponsive'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import StorefrontCatalogStatus from '@/modules/storefront/shared/components/StorefrontCatalogStatus'
import {
    parseBrowseQuery,
    productsHref,
    type BrowseQuery,
    type SortKey,
} from '../browseQuery'
import MarketplaceFilters, {
    type FilterOption,
} from '../components/MarketplaceFilters'
import MarketplaceHeader from '../components/MarketplaceHeader'
import { discountPercent } from '../components/MarketplaceProductCard'
import { MARKETPLACE_PATH } from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import {
    MARKETPLACE_NAME,
    PRIMARY_BUTTON,
    PRIMARY_BUTTON_CLASS,
    SURFACE,
    divisionTheme,
    productKey,
} from '../marketplaceUi'
import {
    buildSearchIndex,
    normalizeSearchText,
    searchProducts,
} from '../marketplaceSearch'
import {
    rememberReturnScroll,
    takeReturnScroll,
    useMarketplaceBrowseStore,
} from '../store/useMarketplaceBrowseStore'

type SortOption = { value: SortKey; label: string }

const SORT_OPTIONS: SortOption[] = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'discount', label: 'Biggest discount' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
]

const PAGE_SIZE = 24
const SEARCH_URL_DELAY_MS = 300

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:gap-7 xl:grid-cols-3'

const CRUMB_BUTTON =
    'cursor-pointer truncate font-medium text-emerald-700 hover:underline focus:outline-none focus-visible:underline'

/** "Load more" progress, kept across product-page visits so Back lands on the same card. */
let savedPaging: { key: string; limit: number } | null = null

const byDiscount = (products: SdProductRecord[]) =>
    [...products].sort(
        (a, b) => (discountPercent(b) ?? 0) - (discountPercent(a) ?? 0),
    )

const FilterChip = ({
    label,
    onRemove,
}: {
    label: string
    onRemove: () => void
}) => (
    <button
        type="button"
        aria-label={`Remove filter ${label}`}
        className="group flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 py-1 pl-3 pr-2 text-xs font-medium text-emerald-800 transition-colors hover:border-emerald-200 hover:bg-emerald-100"
        onClick={onRemove}
    >
        {label}
        <HiX className="text-emerald-500 group-hover:text-emerald-800" />
    </button>
)

type CompanyFilterOption = FilterOption & {
    name: string
    code: string
}

const GridSkeleton = () => (
    <div className={GRID} aria-busy="true" aria-label="Loading products">
        {Array.from({ length: 8 }, (_, i) => (
            <div
                key={i}
                className={classNames(
                    'flex flex-col gap-3 rounded-2xl p-3',
                    SURFACE,
                )}
            >
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton height={12} width="40%" className="rounded" />
                <Skeleton height={14} width="85%" className="rounded" />
                <Skeleton height={18} width="50%" className="rounded" />
                <Skeleton height={36} className="rounded-lg" />
            </div>
        ))}
    </div>
)

/** Full catalogue at /shop/products: search, store and category filters, sort and "Load more". */
const MarketplaceProductsPage = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const query = useMemo(
        () => parseBrowseQuery(new URLSearchParams(searchParams.toString())),
        [searchParams],
    )
    const {
        catalog,
        renderCard: renderProductCard,
        openProduct,
    } = useMarketplace()
    const search = useMarketplaceBrowseStore((s) => s.search)
    const setSearch = useMarketplaceBrowseStore((s) => s.setSearch)

    const [filtersOpen, setFiltersOpen] = useState(false)
    const { smaller } = useResponsive()
    const isMobile = smaller.sm

    /** URL `q` → search box (arrival, Back/Forward); typing writes back to the URL below. */
    const syncedQuery = useRef<string | null>(null)

    const update = useCallback(
        (next: Partial<BrowseQuery>) => {
            const merged: BrowseQuery = {
                ...query,
                q: useMarketplaceBrowseStore.getState().search.trim(),
                ...next,
            }
            syncedQuery.current = merged.q
            router.replace(productsHref(merged), { scroll: false })
        },
        [router, query],
    )

    useEffect(() => {
        if (query.q === syncedQuery.current) return
        syncedQuery.current = query.q
        setSearch(query.q)
    }, [query.q, setSearch])

    const deferredSearch = useDeferredValue(search)
    useEffect(() => {
        const q = deferredSearch.trim()
        if (q === query.q) return
        const timer = setTimeout(() => update({ q }), SEARCH_URL_DELAY_MS)
        return () => clearTimeout(timer)
    }, [deferredSearch, query.q, update])

    const normalizedQuery = normalizeSearchText(deferredSearch)
    const searchIndex = useMemo(
        () => buildSearchIndex(catalog.records),
        [catalog.records],
    )
    const searchScores = useMemo(
        () =>
            normalizedQuery
                ? searchProducts(searchIndex, normalizedQuery)
                : null,
        [searchIndex, normalizedQuery],
    )
    const matchesSearch = useCallback(
        (product: SdProductRecord) =>
            !searchScores || searchScores.has(productKey(product)),
        [searchScores],
    )

    /**
     * A marketplace company is the company on an active SD product-to-MM
     * material assignment. It is intentionally not inferred from sales
     * divisions or from every MM valuation record.
     */
    const companyOptions = useMemo<CompanyFilterOption[]>(() => {
        const companies = new Map<string, CompanyFilterOption>()

        for (const product of catalog.records) {
            if (!matchesSearch(product) || !product.company) continue

            const existing = companies.get(product.company.id)
            if (existing) {
                existing.count += 1
                continue
            }

            companies.set(product.company.id, {
                value: product.company.id,
                label: product.company.code || product.company.name,
                name: product.company.name,
                code: product.company.code,
                count: 1,
            })
        }

        return [...companies.values()].sort((a, b) =>
            a.label.localeCompare(b.label),
        )
    }, [catalog.records, matchesSearch])

    const categoryOptions = useMemo<FilterOption[]>(() => {
        const counts = new Map<string, number>()
        for (const product of catalog.records) {
            if (
                query.stores.length > 0 &&
                !query.stores.includes(product.divisionId)
            )
                continue
            if (
                query.companies.length > 0 &&
                !query.companies.includes(product.company?.id ?? '')
            )
                continue
            if (!matchesSearch(product)) continue
            counts.set(
                product.category,
                (counts.get(product.category) ?? 0) + 1,
            )
        }
        return [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, count]) => ({
                value: category,
                label: category,
                count,
            }))
    }, [catalog.records, query.stores, query.companies, matchesSearch])

    /** Ignore categories the chosen stores don't sell (e.g. from an old link). */
    const activeCategories = catalog.ready
        ? query.categories.filter((category) =>
              categoryOptions.some((option) => option.value === category),
          )
        : query.categories

    const visibleProducts = useMemo(() => {
        const filtered = catalog.records.filter(
            (product) =>
                (query.stores.length === 0 ||
                    query.stores.includes(product.divisionId)) &&
                (query.companies.length === 0 ||
                    query.companies.includes(product.company?.id ?? '')) &&
                (activeCategories.length === 0 ||
                    activeCategories.includes(product.category)) &&
                matchesSearch(product),
        )
        if (query.sort === 'price-asc')
            return [...filtered].sort((a, b) => a.price - b.price)
        if (query.sort === 'price-desc')
            return [...filtered].sort((a, b) => b.price - a.price)
        if (query.sort === 'discount') return byDiscount(filtered)
        if (searchScores) {
            const score = (product: SdProductRecord) =>
                searchScores.get(productKey(product)) ?? 0
            return [...filtered].sort((a, b) => score(b) - score(a))
        }
        return filtered
    }, [
        catalog.records,
        query.stores,
        query.companies,
        query.sort,
        activeCategories,
        matchesSearch,
        searchScores,
    ])

    const filterKey = [
        query.stores.join(','),
        query.companies.join(','),
        activeCategories.join(','),
        query.sort,
        normalizedQuery,
    ].join('|')
    const [paging, setPaging] = useState(() =>
        savedPaging?.key === filterKey
            ? savedPaging
            : { key: filterKey, limit: PAGE_SIZE },
    )
    const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE
    useEffect(() => {
        savedPaging = { key: filterKey, limit }
    }, [filterKey, limit])
    const shownProducts = visibleProducts.slice(0, limit)
    const remaining = visibleProducts.length - shownProducts.length

    const restored = useRef(false)
    useEffect(() => {
        if (!catalog.ready || restored.current) return
        restored.current = true
        const top = takeReturnScroll()
        if (top !== null) requestAnimationFrame(() => window.scrollTo({ top }))
    }, [catalog.ready])

    const searching = normalizedQuery !== ''
    const singleStore = query.stores.length === 1 ? query.stores[0] : null
    const singleCompanyId =
        query.companies.length === 1 ? query.companies[0] : null
    const singleCategory =
        activeCategories.length === 1 ? activeCategories[0] : null
    const company = singleCompanyId
        ? companyOptions.find((option) => option.value === singleCompanyId)
        : undefined
    /** Real seller brand of a single-store browse: the MM company behind the store's products. */
    const storeCompany = useMemo(
        () =>
            company ??
            (singleStore
                ? catalog.records.find(
                      (product) =>
                          product.divisionId === singleStore &&
                          product.company?.name?.trim(),
                  )?.company
                : undefined),
        [company, singleStore, catalog.records],
    )
    const storeTheme = divisionTheme(singleStore)
    const StoreIcon = Building2
    const storeTotal = singleCompanyId
        ? catalog.records.filter((p) => p.company?.id === singleCompanyId)
              .length
        : singleStore
          ? catalog.records.filter((p) => p.divisionId === singleStore).length
          : 0

    const title = searching
        ? `Results for “${deferredSearch.trim()}”`
        : singleCategory
          ? singleCategory
          : company
            ? company.name
            : singleStore
              ? productDivisionLabel(singleStore)
              : query.sort === 'discount'
                ? "Today's Best Deals"
                : 'All Products'

    useEffect(() => {
        const previous = document.title
        document.title = `${title} | ${MARKETPLACE_NAME}`
        return () => {
            document.title = previous
        }
    }, [title])

    const filterCount =
        query.stores.length +
        query.companies.length +
        activeCategories.length +
        (searching ? 1 : 0)

    const clearAll = () => {
        setSearch('')
        update({ stores: [], companies: [], categories: [], q: '' })
    }

    const goHome = () => {
        setSearch('')
        router.push(MARKETPLACE_PATH)
    }

    const renderCard = (product: SdProductRecord) =>
        renderProductCard(product, (opened) => {
            rememberReturnScroll()
            openProduct(opened)
        })

    const filters = (
        <MarketplaceFilters
            companies={companyOptions}
            categories={categoryOptions}
            selectedCompanies={query.companies}
            selectedCategories={activeCategories}
            onCompaniesChange={(companies) => update({ companies })}
            onCategoriesChange={(categories) => update({ categories })}
            onReset={() => update({ companies: [], categories: [] })}
        />
    )

    const countLabel = !catalog.ready
        ? 'Loading products…'
        : `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'}`

    return (
        <div className="min-h-screen bg-gray-50">
            <MarketplaceHeader
                onSearchSubmit={() =>
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                }
            />

            <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
                <Breadcrumb
                    className="mb-6"
                    items={[
                        {
                            label: (
                                <button
                                    type="button"
                                    className={CRUMB_BUTTON}
                                    onClick={goHome}
                                >
                                    Home
                                </button>
                            ),
                        },
                        filterCount > 0 || query.sort !== 'recommended'
                            ? {
                                  label: (
                                      <button
                                          type="button"
                                          className={CRUMB_BUTTON}
                                          onClick={() => {
                                              syncedQuery.current = ''
                                              setSearch('')
                                              router.push(productsHref())
                                          }}
                                      >
                                          All Products
                                      </button>
                                  ),
                              }
                            : { label: 'All Products' },
                        ...(filterCount > 0 || query.sort !== 'recommended'
                            ? [{ label: title }]
                            : []),
                    ]}
                />

                {(company || singleStore) && !searching ? (
                    <section
                        className={classNames(
                            'mb-8 flex flex-col gap-5 overflow-hidden rounded-2xl bg-gradient-to-br p-6 sm:flex-row sm:items-center sm:p-8',
                            SURFACE,
                            storeTheme.wash,
                        )}
                    >
                        <span
                            className={classNames(
                                'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-sm',
                                storeTheme.solid,
                            )}
                        >
                            <StoreIcon
                                aria-hidden
                                className="h-7 w-7"
                                strokeWidth={1.75}
                            />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                {company
                                    ? 'MM valuation company'
                                    : 'Official store'}
                            </p>
                            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight text-gray-900">
                                <span className="truncate">
                                    {singleCategory ??
                                        storeCompany?.name ??
                                        productDivisionLabel(singleStore!)}
                                </span>
                                {!singleCategory ? (
                                    <BadgeCheck
                                        aria-hidden
                                        className="h-6 w-6 shrink-0 text-emerald-500"
                                    />
                                ) : null}
                            </h1>
                            <p className="mt-1 text-sm text-gray-500">
                                {singleCategory
                                    ? company
                                        ? `From ${company.name}${company.code ? ` · ${company.code}` : ''}`
                                        : storeCompany
                                          ? `From ${storeCompany.name}`
                                          : `From ${productDivisionLabel(singleStore!)}`
                                    : company
                                      ? `Products linked to MM materials valued for ${company.name}.`
                                      : storeCompany
                                        ? `Products sold by ${storeCompany.name}.`
                                        : `${productDivisionLabel(singleStore!)} storefront products.`}
                            </p>
                        </div>
                        {catalog.ready ? (
                            <p
                                className={classNames(
                                    'shrink-0 text-sm font-medium',
                                    storeTheme.text,
                                )}
                            >
                                {storeTotal} product
                                {storeTotal === 1 ? '' : 's'}
                            </p>
                        ) : null}
                    </section>
                ) : (
                    <section className="mb-8 flex items-center gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            {searching ? (
                                <HiOutlineSearch
                                    aria-hidden
                                    className="text-2xl"
                                />
                            ) : (
                                <LayoutGrid
                                    aria-hidden
                                    className="h-6 w-6"
                                    strokeWidth={1.75}
                                />
                            )}
                        </span>
                        <div className="min-w-0">
                            <h1 className="truncate text-3xl font-semibold tracking-tight text-gray-900">
                                {title}
                            </h1>
                            <p className="mt-1 text-sm text-gray-500">
                                {searching
                                    ? 'Searching published catalogue products across all companies.'
                                    : 'Published products linked to their MM materials and valuation companies.'}
                            </p>
                        </div>
                    </section>
                )}

                <div className="flex gap-8">
                    <aside className="hidden w-64 shrink-0 lg:block">
                        <Card
                            className={classNames(
                                'sticky top-24 rounded-xl',
                                SURFACE,
                            )}
                        >
                            {filters}
                        </Card>
                    </aside>

                    <section aria-label="Products" className="min-w-0 flex-1">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <span
                                className="text-sm text-gray-500"
                                aria-live="polite"
                            >
                                {catalog.ready && remaining > 0
                                    ? `Showing ${shownProducts.length} of ${visibleProducts.length} products`
                                    : countLabel}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    className="lg:hidden"
                                    icon={<HiOutlineAdjustments />}
                                    onClick={() => setFiltersOpen(true)}
                                >
                                    Filters
                                    {query.stores.length +
                                        query.companies.length +
                                        activeCategories.length >
                                    0
                                        ? ` (${query.stores.length + query.companies.length + activeCategories.length})`
                                        : ''}
                                </Button>
                                <div className="w-48">
                                    <Select<SortOption>
                                        size="sm"
                                        isSearchable={false}
                                        aria-label="Sort products"
                                        options={SORT_OPTIONS}
                                        value={SORT_OPTIONS.find(
                                            (o) => o.value === query.sort,
                                        )}
                                        onChange={(option) =>
                                            update({
                                                sort:
                                                    option?.value ??
                                                    'recommended',
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        {filterCount > 0 ? (
                            <div className="mb-6 flex flex-wrap items-center gap-2">
                                {searching ? (
                                    <FilterChip
                                        label={`“${deferredSearch.trim()}”`}
                                        onRemove={() => {
                                            setSearch('')
                                            update({ q: '' })
                                        }}
                                    />
                                ) : null}
                                {query.stores.map((divisionId) => (
                                    <FilterChip
                                        key={divisionId}
                                        label={productDivisionLabel(divisionId)}
                                        onRemove={() =>
                                            update({
                                                stores: query.stores.filter(
                                                    (s) => s !== divisionId,
                                                ),
                                            })
                                        }
                                    />
                                ))}
                                {query.companies.map((companyId) => (
                                    <FilterChip
                                        key={companyId}
                                        label={
                                            companyOptions.find(
                                                (option) =>
                                                    option.value === companyId,
                                            )?.label ?? 'Company'
                                        }
                                        onRemove={() =>
                                            update({
                                                companies:
                                                    query.companies.filter(
                                                        (id) =>
                                                            id !== companyId,
                                                    ),
                                            })
                                        }
                                    />
                                ))}
                                {activeCategories.map((category) => (
                                    <FilterChip
                                        key={category}
                                        label={category}
                                        onRemove={() =>
                                            update({
                                                categories:
                                                    activeCategories.filter(
                                                        (c) => c !== category,
                                                    ),
                                            })
                                        }
                                    />
                                ))}
                                {filterCount > 1 ? (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        className="!px-1 text-xs font-medium !text-gray-500 hover:!text-emerald-700"
                                        onClick={clearAll}
                                    >
                                        Clear all
                                    </Button>
                                ) : null}
                            </div>
                        ) : null}

                        {catalog.ready ? (
                            <div className={GRID}>
                                {shownProducts.map((product) => (
                                    <Fragment key={productKey(product)}>
                                        {renderCard(product)}
                                    </Fragment>
                                ))}
                            </div>
                        ) : catalog.error ? null : (
                            <GridSkeleton />
                        )}

                        {remaining > 0 ? (
                            <div className="mt-10 flex flex-col items-center gap-3">
                                <div
                                    className="h-1 w-48 overflow-hidden rounded-full bg-gray-200"
                                    aria-hidden
                                >
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                                        style={{
                                            width: `${(shownProducts.length / visibleProducts.length) * 100}%`,
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    You&apos;ve seen {shownProducts.length} of{' '}
                                    {visibleProducts.length} products
                                </p>
                                <Button
                                    className={PRIMARY_BUTTON_CLASS}
                                    customColorClass={PRIMARY_BUTTON}
                                    onClick={() =>
                                        setPaging({
                                            key: filterKey,
                                            limit: limit + PAGE_SIZE,
                                        })
                                    }
                                >
                                    Load {Math.min(PAGE_SIZE, remaining)} more
                                </Button>
                            </div>
                        ) : null}

                        {catalog.ready && visibleProducts.length === 0 ? (
                            <Card
                                className={classNames('rounded-2xl', SURFACE)}
                                bodyClass="flex flex-col items-center gap-3 px-6 py-14 text-center"
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">
                                    <HiOutlineSearch aria-hidden />
                                </span>
                                <h2 className="text-lg font-semibold tracking-tight text-gray-900">
                                    {catalog.records.length === 0
                                        ? 'No products available yet'
                                        : 'No products match'}
                                </h2>
                                <p className="max-w-sm text-sm text-gray-500">
                                    {catalog.records.length === 0
                                        ? 'Check back soon. Our stores are adding products.'
                                        : 'Try a different search or remove a filter to see more products.'}
                                </p>
                                {filterCount > 0 ? (
                                    <Button
                                        className={classNames(
                                            'mt-2',
                                            PRIMARY_BUTTON_CLASS,
                                        )}
                                        customColorClass={PRIMARY_BUTTON}
                                        onClick={clearAll}
                                    >
                                        Clear filters
                                    </Button>
                                ) : null}
                            </Card>
                        ) : null}

                        <StorefrontCatalogStatus
                            loading={false}
                            error={catalog.ready ? null : catalog.error}
                            empty={false}
                            onRetry={catalog.reload}
                        />
                    </section>
                </div>
            </main>

            <Drawer
                title="Filters"
                isOpen={filtersOpen}
                placement={isMobile ? 'bottom' : 'left'}
                width={300}
                height="75dvh"
                className={
                    isMobile ? '[&_.drawer-content]:rounded-t-2xl' : undefined
                }
                onClose={() => setFiltersOpen(false)}
                onRequestClose={() => setFiltersOpen(false)}
                footer={
                    <Button
                        block
                        className={PRIMARY_BUTTON_CLASS}
                        customColorClass={PRIMARY_BUTTON}
                        onClick={() => setFiltersOpen(false)}
                    >
                        Show {visibleProducts.length} product
                        {visibleProducts.length === 1 ? '' : 's'}
                    </Button>
                }
            >
                {filters}
            </Drawer>
        </div>
    )
}

export default MarketplaceProductsPage
