import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

/** MM company logo projected for public storefront use. */
export type StorefrontBrand = {
    divisionId: string
    companyName: string
    logoUrl: string
}

/** Brand logos for official-store cards, from `GET /sd/products/storefront/brands`. */
export async function fetchStorefrontBrands(): Promise<StorefrontBrand[]> {
    const { data } = await ErpAxiosBase.get<StorefrontBrand[]>(
        '/sd/products/storefront/brands',
    )
    return data ?? []
}
