'use client'

import {
    Armchair,
    Box,
    Cable,
    CookingPot,
    Cpu,
    Cylinder,
    Flame,
    FlaskConical,
    HardHat,
    Keyboard,
    Layers,
    Network,
    NotebookPen,
    Package,
    Paperclip,
    Pill,
    Settings,
    Shirt,
    ShoppingBag,
    Watch,
    WashingMachine,
    Wind,
    Wrench,
    Zap,
    type LucideIcon,
} from 'lucide-react'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { divisionTheme } from '../marketplaceUi'

/** Icons for known category names (MM material categories and legacy shop ones). */
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
    Boxes: Box,
    Chemicals: FlaskConical,
    Consumables: Package,
    Electrical: Zap,
    Furniture: Armchair,
    Hardware: Wrench,
    'IT Equipment': Cpu,
    Mechanical: Settings,
    Metals: Layers,
    Networking: Network,
    'Office Supplies': Paperclip,
    Packaging: Package,
    Peripherals: Keyboard,
    Plastics: Layers,
    'Raw Materials': Layers,
    'Safety Gear': HardHat,
    'Spare Parts': Cable,
    Stationery: NotebookPen,
    Textiles: Shirt,
    Wrapping: Package,
}

export type MarketplaceCategory = {
    name: string
    /** The only store selling this category, or null when several do. */
    divisionId: string | null
    count: number
    /** Image uploaded on the MM material category (falls back to the icon). */
    imageUrl: string | null
}

/**
 * Categories present in the live catalogue (product.category comes from the
 * linked MM material), most-stocked first. The category image is the one
 * uploaded in Material Master → Material Categories.
 */
export const marketplaceCategories = (
    records: SdProductRecord[],
): MarketplaceCategory[] => {
    const byName = new Map<
        string,
        { divisions: Set<string>; count: number; imageUrl: string | null }
    >()
    for (const product of records) {
        const name = product.category?.trim()
        if (!name) continue
        const entry =
            byName.get(name) ??
            { divisions: new Set<string>(), count: 0, imageUrl: null }
        entry.divisions.add(product.divisionId)
        entry.count += 1
        if (!entry.imageUrl && product.categoryImageUrl?.trim()) {
            entry.imageUrl = product.categoryImageUrl.trim()
        }
        byName.set(name, entry)
    }
    return [...byName.entries()]
        .map(([name, { divisions, count, imageUrl }]) => ({
            name,
            divisionId: divisions.size === 1 ? [...divisions][0] : null,
            count,
            imageUrl,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

type MarketplaceCategoryGridProps = {
    activeCategory: string | null
    categories: MarketplaceCategory[]
    onSelect: (category: MarketplaceCategory) => void
}

/** Round category shortcuts in an even grid (one row of six on desktop). */
const MarketplaceCategoryGrid = ({
    activeCategory,
    categories,
    onSelect,
}: MarketplaceCategoryGridProps) => (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-6">
        {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.name] ?? Package
            const theme = divisionTheme(category.divisionId)
            const active = activeCategory === category.name
            const { count, imageUrl } = category
            return (
                <li key={category.name}>
                    <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${category.name}, ${count} products`}
                        className="group flex w-full flex-col items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        onClick={() => onSelect(category)}
                    >
                        <span
                            className={classNames(
                                'flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-36 sm:w-36 lg:h-40 lg:w-40',
                                imageUrl
                                    ? [
                                          'bg-white ring-1 ring-gray-200',
                                          active ? 'ring-2 ring-emerald-500' : '',
                                      ]
                                    : active
                                      ? [theme.solid, 'shadow-sm']
                                      : [theme.tile, theme.hoverSolid],
                            )}
                        >
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                            ) : (
                                <Icon
                                    aria-hidden
                                    className="h-12 w-12 lg:h-14 lg:w-14"
                                    strokeWidth={1.5}
                                />
                            )}
                        </span>
                        <span className="flex flex-col items-center gap-0.5 text-center">
                            <span
                                className={classNames(
                                    'text-base leading-snug text-gray-900',
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
