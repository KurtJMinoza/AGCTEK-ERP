'use client'

import {
    BadgeCheck,
    ChevronRight,
    Flame,
    HeartPulse,
    Refrigerator,
    type LucideIcon,
} from 'lucide-react'
import classNames from '@/utils/classNames'
import { LPG_DIVISION_ID } from '@/modules/sd/catalogs/lpgCatalog'
import { APPLIANCES_DIVISION_ID } from '@/modules/sd/catalogs/mconpincoCatalog'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
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

type MarketplaceOfficialStoresProps = {
    /** Product count per division. */
    counts: Map<string, number>
    activeDivisionId: string | null
    onSelect: (divisionId: string) => void
}

/** Brand-store cards; selecting one shows that division's products. */
const MarketplaceOfficialStores = ({
    counts,
    activeDivisionId,
    onSelect,
}: MarketplaceOfficialStoresProps) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {OFFICIAL_STORES.map((store) => {
            const Icon = store.icon
            const theme = divisionTheme(store.divisionId)
            const active = activeDivisionId === store.divisionId
            const count = counts.get(store.divisionId) ?? 0
            return (
                <button
                    key={store.divisionId}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Visit ${store.name} official store, ${store.tagline}, ${count} products`}
                    className={classNames(
                        'group flex min-w-0 cursor-pointer items-center gap-4 rounded-xl bg-gradient-to-br p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                        SURFACE,
                        SURFACE_HOVER,
                        theme.wash,
                        active && theme.activeBorder,
                    )}
                    onClick={() => onSelect(store.divisionId)}
                >
                    <span
                        className={classNames(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                            active
                                ? theme.solid
                                : [theme.tile, theme.hoverSolid],
                        )}
                    >
                        <Icon
                            aria-hidden
                            className="h-5 w-5"
                            strokeWidth={1.75}
                        />
                    </span>
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
                        <span className="mt-0.5 block truncate text-sm text-gray-500">
                            {store.tagline}
                        </span>
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

export default MarketplaceOfficialStores
