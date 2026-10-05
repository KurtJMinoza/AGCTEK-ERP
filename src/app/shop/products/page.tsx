import { Suspense } from 'react'
import type { Metadata } from 'next'
import MarketplaceProductsPage from '@/modules/storefront/marketplace/pages/MarketplaceProductsPage'

export const metadata: Metadata = {
    title: 'All Products | AGC Marketplace',
    description:
        'Browse every product from AWIC, LPG and MCONPINCO: filter by store and category, sort by price or discount.',
}

export default function ProductsRoute() {
    return (
        <Suspense>
            <MarketplaceProductsPage />
        </Suspense>
    )
}
