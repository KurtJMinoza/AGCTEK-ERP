import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import { divisionForStoreSlug } from '@/modules/storefront/marketplace/host'
import MarketplaceProductPage from '@/modules/storefront/marketplace/pages/MarketplaceProductPage'

const MARKETPLACE_NAME = 'AGC Marketplace'

type ProductRouteProps = {
    params: Promise<{ store: string; sku: string }>
}

const decodeSku = (value: string) => {
    try {
        return decodeURIComponent(value)
    } catch {
        return null
    }
}

export async function generateMetadata({
    params,
}: ProductRouteProps): Promise<Metadata> {
    const { store } = await params
    const divisionId = divisionForStoreSlug(store)
    return {
        title: divisionId
            ? `${productDivisionLabel(divisionId)} | ${MARKETPLACE_NAME}`
            : MARKETPLACE_NAME,
    }
}

export default async function ProductRoute({ params }: ProductRouteProps) {
    const { store, sku } = await params
    const divisionId = divisionForStoreSlug(store)
    const decodedSku = decodeSku(sku)
    if (!divisionId || !decodedSku) notFound()

    return (
        <MarketplaceProductPage
            key={`${divisionId}:${decodedSku}`}
            divisionId={divisionId}
            sku={decodedSku}
        />
    )
}
