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

export type SdProductType = 'STOCK_ITEM' | 'NON_STOCK_ITEM' | 'SERVICE'

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
    productType?: SdProductType
    /** Required for STOCK_ITEM — explicit SD ↔ MM link at creation. */
    materialId?: string
    materialIds?: string[]
    materialLinkMode?: 'single' | 'multiple'
    companyId?: string
    autoGenerateSku?: boolean
    imageGallery?: string[]
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

/** Cover plus gallery URLs for storefront cards (supports legacy `attributes.gallery`). */
export function productImageGallery(
    record: Pick<SdProductRecord, 'imageUrl' | 'attributes'>,
): string[] {
    const fromImages = productGallery(record)
    const legacy = record.attributes?.gallery
    const legacyGallery = Array.isArray(legacy)
        ? legacy.filter(
              (u): u is string => typeof u === 'string' && u.trim().length > 0,
          )
        : []
    const extra = fromImages.length ? fromImages : legacyGallery
    const cover = record.imageUrl?.trim() ?? ''
    if (!cover) return extra
    return [cover, ...extra.filter((u) => u !== cover)]
}

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

export async function suggestProductSku(divisionId: string): Promise<string> {
    try {
        const { data } = await ErpAxiosBase.get<{ sku: string }>(
            '/sd/products/suggested-sku',
            { params: { divisionId } },
        )
        return data.sku
    } catch (error) {
        throw toError(error, 'Unable to suggest SKU')
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

export async function createProduct(
    input: ProductInput,
): Promise<SdProductRecord> {
    const {
        materialId,
        materialIds,
        materialLinkMode,
        companyId,
        productType,
        autoGenerateSku,
        imageGallery,
        galleryImages: _galleryImages,
        ...rest
    } = input
    const body: Record<string, unknown> = {
        ...rest,
        productType,
        autoGenerateSku,
        imageGallery,
        materialLinkMode,
    }
    if (productType === 'STOCK_ITEM' && companyId?.trim()) {
        body.companyId = companyId.trim()
        const ids =
            materialIds?.filter(Boolean) ??
            (materialId?.trim() ? [materialId.trim()] : [])
        if (ids.length) body.materialIds = ids
    }
    if (autoGenerateSku) {
        delete body.sku
    }
    try {
        const { data } = await ErpAxiosBase.post<ApiProduct>(
            '/sd/products',
            body as ProductInput,
        )
        return fromApi(data)
    } catch (error) {
        throw toError(error, 'Unable to create product')
    }
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

export async function deleteProduct(id: string): Promise<void> {
    try {
        await ErpAxiosBase.delete(`/sd/products/${encodeURIComponent(id)}`)
    } catch (error) {
        throw toError(error, 'Unable to delete product')
    }
}

/** @deprecated Prefer multipart update; kept for legacy gallery URL uploads. */
export async function uploadProductImage(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    try {
        const { data } = await ErpAxiosBase.post<{ imageUrl: string }>(
            '/sd/products/images',
            formData,
        )
        return data.imageUrl
    } catch (error) {
        throw toError(error, 'Unable to upload image')
    }
}
