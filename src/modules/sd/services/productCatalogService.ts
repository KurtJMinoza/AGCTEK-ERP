import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'
import type { OptionsVariantsDraft } from './productOptionVariantsService'

export type ProductAttributes = Record<string, unknown>

/** MM company from the primary active product ↔ material assignment. */
export type SdProductCompany = {
    id: string
    name: string
    code: string
    logoUrl: string | null
}

export type SdProductRecord = {
    id: string
    divisionId: string
    /** Linked MM company (stock items); null when not mapped to material. */
    company?: SdProductCompany | null
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
    companyId?: string
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
    /** Stock items take the linked MM material's category server-side. */
    category?: string
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
    /** Options + variants draft; saved via the product options endpoint after the product row exists. */
    optionsVariants?: OptionsVariantsDraft | null
}

/** Matches the server's PRODUCT_GALLERY_MAX. */
export const PRODUCT_GALLERY_MAX = 8

/** Extra storefront photos kept in `attributes.images`. */
export const productGallery = (record: Pick<SdProductRecord, 'attributes'>) =>
    productAttribute<unknown[]>(record, 'images', []).filter(
        (url): url is string => typeof url === 'string' && url.trim() !== '',
    )

const stringList = (value: unknown) =>
    Array.isArray(value)
        ? value.filter(
              (u): u is string => typeof u === 'string' && u.trim().length > 0,
          )
        : []

/**
 * Cover first, then every extra photo — `attributes.images` plus the
 * `attributes.gallery` list the Product Catalog form saves — without duplicates.
 */
export function productImageGallery(
    record: Pick<SdProductRecord, 'imageUrl' | 'attributes'>,
): string[] {
    const cover = record.imageUrl?.trim() ?? ''
    return [
        ...new Set([
            ...(cover ? [cover] : []),
            ...productGallery(record),
            ...stringList(record.attributes?.gallery),
        ]),
    ]
}

/** Matches the server's PRODUCT_VIDEO_MAX. */
export const PRODUCT_VIDEO_MAX = 4

/** Product videos kept in `attributes.videos`. */
export const productVideos = (record: Pick<SdProductRecord, 'attributes'>) =>
    stringList(record.attributes?.videos)

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
                companyId: params.companyId || undefined,
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

export type StorefrontAvailability = {
    sku: string
    /** Commercial ATP (Product Catalog "Stock available"). */
    availableQuantity: number
    reservedQuantity: number
    /** Company on-hand across warehouses (MM ledger). */
    physicalStock: number
    /** Company available across warehouses (MM ledger). */
    ledgerAvailable?: number
    state?:
        | 'IN_STOCK'
        | 'LOW_STOCK'
        | 'OUT_OF_STOCK'
        | 'NOT_MAPPED'
        | 'NON_INVENTORY'
}

/** Storefront stock for one product, computed server-side by SD ↔ MM ATP. */
export async function fetchStorefrontAvailability(
    divisionId: string,
    sku: string,
): Promise<StorefrontAvailability> {
    const empty: StorefrontAvailability = {
        sku,
        availableQuantity: 0,
        reservedQuantity: 0,
        physicalStock: 0,
        ledgerAvailable: 0,
        state: 'OUT_OF_STOCK',
    }
    try {
        const { data } = await ErpAxiosBase.get<StorefrontAvailability>(
            '/sd/products/storefront/availability',
            { params: { divisionId, sku } },
        )
        return {
            ...empty,
            ...data,
            ledgerAvailable:
                data.ledgerAvailable ?? data.availableQuantity ?? 0,
        }
    } catch (error: unknown) {
        const payload =
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            typeof (error as { response?: { data?: StorefrontAvailability } })
                .response?.data === 'object'
                ? (error as { response: { data: StorefrontAvailability } })
                      .response.data
                : null
        if (payload?.sku) return { ...empty, ...payload }
        throw toError(error, 'Unable to load stock')
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

/** Uploads a product video (MP4/WEBM/MOV); returns the URL for `attributes.videos`. */
export type CatalogStockSnapshot = {
    availableQty: number
    state: string
}

/** MM-backed available qty per product (storefront ATP by division + SKU). */
export async function fetchProductCatalogStock(
    products: SdProductRecord[],
): Promise<Record<string, CatalogStockSnapshot>> {
    if (!products.length) return {}
    const pairs = await Promise.all(
        products.map(async (product) => {
            try {
                const { data } = await ErpAxiosBase.get<{
                    availableQuantity: number
                    state: string
                }>('/sd/products/storefront/availability', {
                    params: {
                        divisionId: product.divisionId,
                        sku: product.sku,
                    },
                })
                return [
                    product.id,
                    {
                        availableQty: data.availableQuantity ?? 0,
                        state: data.state ?? 'OUT_OF_STOCK',
                    },
                ] as const
            } catch {
                return [
                    product.id,
                    { availableQty: 0, state: 'NOT_MAPPED' },
                ] as const
            }
        }),
    )
    return Object.fromEntries(pairs)
}

export async function uploadProductVideo(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    try {
        const { data } = await ErpAxiosBase.post<{ videoUrl: string }>(
            '/sd/products/videos',
            formData,
            { timeout: 10 * 60_000 },
        )
        return data.videoUrl
    } catch (error) {
        throw toError(error, 'Unable to upload video')
    }
}
