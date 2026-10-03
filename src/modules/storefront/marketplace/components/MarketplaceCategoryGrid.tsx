'use client'

import {
    CookingPot,
    Cylinder,
    Flame,
    Package,
    Pill,
    ShoppingBag,
    Watch,
    WashingMachine,
    Wind,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import classNames from '@/utils/classNames'
import { PRODUCT_DIVISIONS } from '@/modules/sd/catalogs/productDivisions'
import { divisionTheme } from '../marketplaceUi'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    Vitamins: Pill,
    Bags: ShoppingBag,
    Accessories: Watch,
    'General Goods': Package,
    Refill: Flame,
    'Brand-New': Cylinder,
    'Add-on': Wrench,
    Cooling: Wind,
    Laundry: WashingMachine,
    Kitchen: CookingPot,
}

export type MarketplaceCategory = { name: string; divisionId: string }

/** Every storefront category with its owning division, in store order. */
export const MARKETPLACE_CATEGORIES: readonly MarketplaceCategory[] =
    PRODUCT_DIVISIONS.flatMap((division) =>
        division.categories.map((name) => ({ name, divisionId: division.id })),
    )

type MarketplaceCategoryGridProps = {
    activeCategory: string | null
    /** Product count per category name. */
    counts: Map<string, number>
    onSelect: (category: MarketplaceCategory) => void
}

/** Round category shortcuts in an even grid (one row of ten on desktop). */
const MarketplaceCategoryGrid = ({
    activeCategory,
    counts,
    onSelect,
}: MarketplaceCategoryGridProps) => (
    <ul className="grid grid-cols-4 gap-x-4 gap-y-8 sm:grid-cols-5 lg:grid-cols-10">
        {MARKETPLACE_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.name] ?? Package
            const theme = divisionTheme(category.divisionId)
            const active = activeCategory === category.name
            const count = counts.get(category.name) ?? 0
            return (
                <li key={`${category.divisionId}:${category.name}`}>
                    <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${category.name}, ${count} products`}
                        className="group flex w-full flex-col items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onClick={() => onSelect(category)}
                    >
                        <span
                            className={classNames(
                                'flex h-20 w-20 cursor-pointer items-center justify-center rounded-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md',
                                active
                                    ? [theme.solid, 'shadow-sm']
                                    : [theme.tile, theme.hoverSolid],
                            )}
                        >
                            <Icon
                                aria-hidden
                                className="h-7 w-7"
                                strokeWidth={1.5}
                            />
                        </span>
                        <span className="flex flex-col items-center gap-0.5 text-center">
                            <span
                                className={classNames(
                                    'text-sm leading-snug text-gray-900',
                                    active ? 'font-semibold' : 'font-medium',
                                )}
                            >
                                {category.name}
                            </span>
                            <span className="text-xs text-gray-400">
                                {count} item{count === 1 ? '' : 's'}
                            </span>
                        </span>
                    </button>
                </li>
            )
        })}
    </ul>
)

export default MarketplaceCategoryGrid
