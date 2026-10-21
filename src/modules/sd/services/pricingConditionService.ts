import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

const BASE = '/sd/pricing-conditions'

export type PricingTab = 'BASE_PRICE' | 'TIER_DISCOUNT' | 'PROMO'
export type PricingConditionType = Exclude<PricingTab, 'BASE_PRICE'>
export type PricingStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE'
/** PRICE = catalog base price (PR00). */
export type PricingValueType = 'PRICE' | 'PERCENT_OFF' | 'FIXED_PRICE'
export type PricingCustomerType = 'ALL' | 'RETAIL' | 'B2B'

export type PricingRecord = {
    /** Product id for base prices, condition id otherwise. */
    id: string
    kind: PricingTab
    conditionCode: string
    name: string
    productId: string | null
    sku: string | null
    productName: string | null
    divisionId: string | null
    minQuantity: number | null
    customerType: PricingCustomerType
    valueType: PricingValueType
    value: number
    promoCode: string | null
    validFrom: string
    validTo: string | null
    status: PricingStatus
}

export type PricingSummary = {
    basePrices: number
    activeTierDiscounts: number
    activePromos: number
}

export type PricingListResult = {
    data: PricingRecord[]
    total: number
    page: number
    pageSize: number
    summary: PricingSummary
}

export type ListPricingParams = {
    tab: PricingTab
    search?: string
    page?: number
    pageSize?: number
}

export type PricingConditionInput = {
    conditionType: PricingConditionType
    conditionCode?: string
    name: string
    productId?: string | null
    minQuantity?: number | null
    customerType?: PricingCustomerType
    valueType: Exclude<PricingValueType, 'PRICE'>
    value: number
    promoCode?: string | null
    validFrom: string
    validTo?: string | null
}

export async function listPricing(
    params: ListPricingParams,
): Promise<PricingListResult> {
    try {
        const { data } = await ErpAxiosBase.get<PricingListResult>(BASE, {
            params: { ...params, search: params.search?.trim() || undefined },
        })
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load pricing conditions')
    }
}

export async function createPricingCondition(
    input: PricingConditionInput,
): Promise<PricingRecord> {
    try {
        const { data } = await ErpAxiosBase.post<PricingRecord>(BASE, input)
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to save pricing condition')
    }
}

export async function updatePricingCondition(
    id: string,
    input: Partial<
        Omit<PricingConditionInput, 'conditionType' | 'conditionCode'>
    >,
): Promise<PricingRecord> {
    try {
        const { data } = await ErpAxiosBase.patch<PricingRecord>(
            `${BASE}/${encodeURIComponent(id)}`,
            input,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to update pricing condition')
    }
}

export async function expirePricingCondition(
    id: string,
): Promise<PricingRecord> {
    try {
        const { data } = await ErpAxiosBase.post<PricingRecord>(
            `${BASE}/${encodeURIComponent(id)}/expire`,
            {},
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to end pricing condition')
    }
}

/** Updates the Product Catalog selling price (PR00). */
export async function updateBasePrice(
    productId: string,
    price: number,
): Promise<PricingRecord> {
    try {
        const { data } = await ErpAxiosBase.put<PricingRecord>(
            `${BASE}/base-prices/${encodeURIComponent(productId)}`,
            { price },
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to update base price')
    }
}
