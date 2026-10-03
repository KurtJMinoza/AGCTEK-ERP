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
}

export function productImageGallery(record: Pick<SdProductRecord, 'imageUrl' | 'attributes'>): string[] {
    const extra = record.attributes?.gallery
    const gallery = Array.isArray(extra)
        ? extra.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : []
    const cover = record.imageUrl?.trim() ?? ''
    if (!cover) return gallery
    return [cover, ...gallery.filter((u) => u !== cover)]
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
): Promise<SdProductRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<ApiProduct>(
            `/sd/products/${encodeURIComponent(id)}`,
            input,
        )
        return fromApi(data)
    } catch (error) {
        throw toError(error, 'Unable to update product')
    }
}

/** Uploads a product photo; returns the `imageUrl` to save on the product. */
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

export async function deleteProduct(id: string): Promise<void> {
    try {
        await ErpAxiosBase.delete(`/sd/products/${encodeURIComponent(id)}`)
    } catch (error) {
        throw toError(error, 'Unable to delete product')
    }
}
