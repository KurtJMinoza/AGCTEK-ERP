import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError } from './apiError'

const BASE = '/sd/deliveries'

export type DeliveryStage = 'PENDING_PICK' | 'PICKING' | 'PACKED' | 'SHIPPED'

/**
 * Next step for the team. Pick / pack / release run in MM.
 * Goods Issue is automated (Auto-GI) — never triggered from SD.
 */
export type DeliveryNextAction = 'RELEASE_TO_WAREHOUSE' | 'PICK' | 'PACK' | null

export type Delivery = {
    salesOrderId: string
    deliveryNumber: string
    salesOrderReference: string
    customerName: string | null
    customerCode: string | null
    channel: string
    currency: string
    totalAmount: number
    primaryProductName: string | null
    primarySku: string | null
    extraItemCount: number
    orderStatus: string
    createdAt: string
    shippedAt: string | null
    stage: DeliveryStage
    nextAction: DeliveryNextAction
    requiredQty: number
    pickedQty: number
}

export type DeliveryLine = {
    id: string
    lineNumber: number
    name: string
    sku: string | null
    variantName: string | null
    divisionId: string | null
    quantity: number
    unitPrice: number | null
    totalAmount: number | null
    uom: string | null
    pickRequiredQty: number
    pickedQty: number
    issuedQty: number
}

type DocumentRef = { number: string; status: string }

export type DeliveryDetail = Delivery & {
    customerEmail: string | null
    approvedAt: string | null
    deliveredAt: string | null
    shipTo: {
        name: string | null
        phone: string | null
        addressLine1: string | null
        city: string | null
        region: string | null
        postalCode: string | null
        country: string | null
    }
    courierName: string | null
    trackingNumber: string | null
    warehouses: Array<{ code: string; name: string }>
    lines: DeliveryLine[]
    documents: {
        pickingTasks: DocumentRef[]
        packages: DocumentRef[]
        goodsIssues: DocumentRef[]
    }
}

export type DeliveryListResult = {
    data: Delivery[]
    total: number
    page: number
    pageSize: number
    summary: Record<DeliveryStage, number>
}

export type ListDeliveriesParams = {
    stage?: DeliveryStage
    search?: string
    page?: number
    pageSize?: number
}

export async function listDeliveries(
    params: ListDeliveriesParams = {},
): Promise<DeliveryListResult> {
    try {
        const { data } = await ErpAxiosBase.get<DeliveryListResult>(BASE, {
            params: { ...params, search: params.search?.trim() || undefined },
        })
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load deliveries')
    }
}

export async function getDelivery(
    salesOrderId: string,
): Promise<DeliveryDetail> {
    try {
        const { data } = await ErpAxiosBase.get<DeliveryDetail>(
            `${BASE}/${encodeURIComponent(salesOrderId)}`,
        )
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to load delivery')
    }
}
