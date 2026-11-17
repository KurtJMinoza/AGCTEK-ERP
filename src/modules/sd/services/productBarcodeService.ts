import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'

const BASE = '/sd/product-barcodes'

export type BarcodeMaterial = {
    id: string
    materialCode: string
    sku: string | null
    name: string
    description: string | null
    brand: string | null
    category: string | null
    uom: string | null
    unitCost: number
    status: string
    sellable: boolean
    companyId: string | null
}

export type BarcodeListing = {
    productId: string
    productName: string
    productSku: string
    status: string
    isActive: boolean
    price: number
    variantId: string
    variantName: string
    variantSku: string
}

export type BarcodeLookup = {
    found: boolean
    barcode: string
    message?: string
    source?: 'MM' | 'SD'
    material?: BarcodeMaterial
    listing?: BarcodeListing | null
    availability?: {
        onHandQty: number
        availableQty: number
        reservedQty: number
    } | null
    action?: 'OPEN_IN_CATALOG' | 'MATERIAL_FOUND_NOT_LISTED'
}

export type QuickAddInput = {
    barcode: string
    productName?: string
    categoryId?: string
    category?: string
    brand?: string
    uomId?: string
    uom?: string
    unitCost?: number
    srp?: number
    companyId: string
    divisionId?: string
    warehouseId?: string
    storageBinId?: string
    initialStock?: number
    allowExisting?: boolean
    createdBy?: string
}

export type QuickAddResult = BarcodeLookup & {
    createdMaterial: boolean
    createdListing: boolean
    stockWarning: string | null
}

export async function lookupProductBarcode(
    code: string,
    companyId?: string,
): Promise<BarcodeLookup> {
    try {
        const { data } = await ErpAxiosBase.get<BarcodeLookup>(
            `${BASE}/${encodeURIComponent(code)}`,
            { params: companyId ? { companyId } : {} },
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to look up the barcode')
    }
}

export async function quickAddProductByBarcode(
    input: QuickAddInput,
): Promise<QuickAddResult> {
    try {
        const { data } = await ErpAxiosBase.post<QuickAddResult>(
            `${BASE}/quick-add`,
            input,
        )
        return data
    } catch (error) {
        throw toError(error, 'Unable to register the material')
    }
}
