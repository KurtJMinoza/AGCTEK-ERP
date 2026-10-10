'use client'

import Image from 'next/image'
import {
    BadgeCheck,
    ChevronRight,
    Flame,
    HeartPulse,
    Refrigerator,
    type LucideIcon,
} from 'lucide-react'
import classNames from '@/utils/classNames'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import { LPG_DIVISION_ID } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { SURFACE, SURFACE_HOVER, divisionTheme } from '../marketplaceUi'

type OfficialStore = {
    divisionId: string
    name: string
    tagline: string
    icon: LucideIcon
}

export const OFFICIAL_STORES: readonly OfficialStore[] = [
    {
        divisionId: RETAIL_DIVISION_ID,
        name: 'AWIC',
        tagline: 'Health & Wellness',
        icon: HeartPulse,
    },
    {
        divisionId: APPLIANCES_DIVISION_ID,
        name: 'MCONPINCO',
        tagline: 'Home Appliances',
        icon: Refrigerator,
    },
    {
        divisionId: LPG_DIVISION_ID,
        name: 'LPG',
        tagline: 'Energy & Gas',
        icon: Flame,
    },
]

export type MarketplaceStoreCard = {
    id: string
    name: string
    tagline?: string
    logoUrl?: string | null
    icon?: LucideIcon
    /** Sales division used for theme colours when no custom branding. */
    themeDivisionId?: string
}

type MarketplaceOfficialStoresProps = {
    stores?: readonly MarketplaceStoreCard[]
    /** Product count per store (division id). */
    counts: Map<string, number>
    activeStoreId: string | null
    onSelect: (storeId: string) => void
}

const StoreLogo = ({
    store,
    active,
    themeSolid,
    themeTile,
    themeHoverSolid,
}: {
    store: MarketplaceStoreCard
    active: boolean
    themeSolid: string
    themeTile: string
    themeHoverSolid: string
}) => {
    const src = store.logoUrl?.trim() ?? ''
    if (isRenderableImageSrc(src)) {
        return (
            <span
                className={classNames(
                    'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-gray-200',
                )}
            >
                <Image
                    src={src}
                    alt=""
                    fill
                    sizes="48px"
                    unoptimized={isUnoptimizedImage(src)}
                    className="object-contain p-1.5"
                />
            </span>
        )
    }
    const Icon = store.icon
    if (!Icon) {
        return (
            <span
                className={classNames(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold uppercase',
                    active ? themeSolid : [themeTile, themeHoverSolid],
                )}
            >
                {store.name.slice(0, 2)}
            </span>
        )
    }
    return (
        <span
            className={classNames(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                active ? themeSolid : [themeTile, themeHoverSolid],
            )}
        >
            <Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </span>
    )
}

const defaultStoreCards = (): MarketplaceStoreCard[] =>
    OFFICIAL_STORES.map((store) => ({
        id: store.divisionId,
        name: store.name,
        tagline: store.tagline,
        icon: store.icon,
        themeDivisionId: store.divisionId,
    }))

/**
 * Store cards stay keyed by sales division (store URLs and per-store checkout
 * depend on it) but show the MM company linked to that store's products.
 */
export const storeCardsFromCatalog = (
    records: readonly Pick<SdProductRecord, 'divisionId' | 'company'>[],
): MarketplaceStoreCard[] =>
    defaultStoreCards().map((card) => {
        const company = records.find(
            (p) => p.divisionId === card.id && p.company?.name?.trim(),
        )?.company
        return company
            ? { ...card, name: company.name.trim(), logoUrl: company.logoUrl }
            : card
    })

/** Brand-store cards; selecting one opens that store's products. */
const MarketplaceOfficialStores = ({
    stores,
    counts,
    activeStoreId,
    onSelect,
}: MarketplaceOfficialStoresProps) => {
    const cards = stores ?? defaultStoreCards()
    return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((store) => {
            const themeDivisionId =
                store.themeDivisionId ?? store.id
            const theme = divisionTheme(themeDivisionId)
            const active = activeStoreId === store.id
            const count = counts.get(store.id) ?? 0
            return (
                <button
                    key={store.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Visit ${store.name} official store, ${store.tagline ?? ''}, ${count} products`}
                    className={classNames(
                        'group flex min-w-0 cursor-pointer items-center gap-4 rounded-xl bg-gradient-to-br p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                        SURFACE,
                        SURFACE_HOVER,
                        theme.wash,
                        active && theme.activeBorder,
                    )}
                    onClick={() => onSelect(store.id)}
                >
                    <StoreLogo
                        store={store}
                        active={active}
                        themeSolid={theme.solid}
                        themeTile={theme.tile}
                        themeHoverSolid={theme.hoverSolid}
                    />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                            <span className="truncate text-base font-semibold tracking-tight text-gray-900">
                                {store.name}
                            </span>
                            <BadgeCheck
                                aria-hidden
                                className="h-4 w-4 shrink-0 text-emerald-500"
                            />
                        </span>
                        {store.tagline ? (
                            <span className="mt-0.5 block truncate text-sm text-gray-500">
                                {store.tagline}
                            </span>
                        ) : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                            className={classNames(
                                'text-xs font-medium',
                                theme.text,
                            )}
                        >
                            {count} item{count === 1 ? '' : 's'}
                        </span>
                        <ChevronRight
                            aria-hidden
                            className="h-4 w-4 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-700"
                        />
                    </span>
                </button>
            )
        })}
    </div>
    )
}

export default MarketplaceOfficialStores
