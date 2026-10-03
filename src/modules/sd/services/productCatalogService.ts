import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'

export type ProductAttributes = Record<string, unknown>

export type SdProductRecord = {
    id: string
    divisionId: string
    sku: string
    name: string
    description: string
    price: number
    originalPrice: number | null
    category: string
    imageUrl: string
    badge: string | null
    isActive: boolean
    sortOrder: number
    /** Division-specific storefront content (features, specs, reviews, …). */
    attributes: ProductAttributes | null
    createdAt: string
    updatedAt: string
}

export type ProductListParams = {
    divisionId?: string
    activeOnly?: boolean
    sku?: string
    search?: string
}

export type ProductInput = {
    divisionId: string
    sku: string
    name: string
    description?: string
    price: number
    originalPrice?: number | null
    category: string
    imageUrl?: string
    badge?: string | null
    isActive?: boolean
    sortOrder?: number
    attributes?: ProductAttributes | null
    /** Existing gallery photos to keep, in order; new ones are uploaded as files. */
    galleryImages?: string[]
}

/** Matches the server's PRODUCT_GALLERY_MAX. */
export const PRODUCT_GALLERY_MAX = 8

/** Extra storefront photos kept in `attributes.images`. */
export const productGallery = (record: Pick<SdProductRecord, 'attributes'>) =>
    productAttribute<unknown[]>(record, 'images', []).filter(
        (url): url is string => typeof url === 'string' && url.trim() !== '',
    )

/** Reads one storefront attribute, falling back when absent. */
export function productAttribute<T>(
    record: Pick<SdProductRecord, 'attributes'>,
    key: string,
    fallback: T,
): T {
    const value = record.attributes?.[key]
    return value === undefined || value === null ? fallback : (value as T)
}

type ApiProduct = Omit<SdProductRecord, 'price' | 'originalPrice'> & {
    price: string | number
    originalPrice: string | number | null
}

const fromApi = (p: ApiProduct): SdProductRecord => ({
    ...p,
    price: Number(p.price),
    originalPrice: p.originalPrice === null ? null : Number(p.originalPrice),
})

export async function listProducts(
    params: ProductListParams = {},
): Promise<SdProductRecord[]> {
    try {
        const { data } = await ErpAxiosBase.get<ApiProduct[]>('/sd/products', {
            params: {
                divisionId: params.divisionId || undefined,
                activeOnly: params.activeOnly ? 'true' : undefined,
                sku: params.sku || undefined,
                search: params.search?.trim() || undefined,
            },
        })
        return data.map(fromApi)
    } catch (error) {
        throw toError(error, 'Unable to load products')
    }
}

/**
 * Multipart body: `data` carries the text fields as JSON, `image` the optional
 * main photo and `gallery` any new gallery photos. The server stores the files
 * and sets `imageUrl` / `attributes.images` itself.
 */
const toProductFormData = (
    input: Partial<ProductInput>,
    image?: File | null,
    gallery: File[] = [],
): FormData => {
    const formData = new FormData()
    formData.append('data', JSON.stringify(input))
    if (image) formData.append('image', image)
    for (const file of gallery) formData.append('gallery', file)
    return formData
}

export async function updateProduct(
    id: string,
    input: Partial<ProductInput>,
    image?: File | null,
    gallery: File[] = [],
): Promise<SdProductRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiProduct>(
            `/sd/products/${encodeURIComponent(id)}`,
            toProductFormData(input, image, gallery),
        )
        return fromApi(data)
    } catch (error) {
        throw toError(error, 'Unable to update product')
    }
}
