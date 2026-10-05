'use client'

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { SECTION_TITLE, productKey } from '../marketplaceUi'

type MarketplaceProductRowProps = {
    id: string
    title: string
    products: SdProductRecord[]
    onViewAll: () => void
    renderCard: (product: SdProductRecord) => ReactNode
}

/** Homepage shelf: section header with "View All" and a sideways-scrolling product row. */
const MarketplaceProductRow = ({
    id,
    title,
    products,
    onViewAll,
    renderCard,
}: MarketplaceProductRowProps) => {
    if (products.length === 0) return null
    return (
        <section aria-labelledby={id}>
            <div className="mb-6 flex items-end justify-between gap-4">
                <h2 id={id} className={SECTION_TITLE}>
                    {title}
                </h2>
                <Button
                    size="xs"
                    variant="plain"
                    className="shrink-0 !px-1 text-sm font-medium !text-gray-500 hover:!text-emerald-600"
                    aria-label={`View all: ${title}`}
                    onClick={onViewAll}
                >
                    <span className="flex items-center gap-0.5">
                        View All
                        <ChevronRight aria-hidden className="h-4 w-4" />
                    </span>
                </Button>
            </div>
            <ul className="hide-scrollbar -mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-4 pt-1 sm:mx-0 sm:gap-7 sm:px-0">
                {products.map((product) => (
                    <li
                        key={productKey(product)}
                        className="w-52 shrink-0 snap-start sm:w-64 lg:w-72"
                    >
                        {renderCard(product)}
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default MarketplaceProductRow
