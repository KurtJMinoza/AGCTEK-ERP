import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { z } from 'zod'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import { toApiError } from './apiError'
import {
    loadPricingCatalog,
    priceLines,
    type PricedLine,
    type SalesDivisionId,
} from './pricingEngine'
import { newIdempotencyKey } from './salesOrderDashboardService'
import {
    PosCheckoutPayloadSchema,
    type PosCheckoutPayload,
} from '../types/pos.schema'

export type POSCheckoutLine = PricedLine

/** Cashier shift (register session) of the terminal. */
export type PosSession = {
    id: string
    companyId: string
    branchId: string
    terminalCode: string
    cashierUserId: string
    openingCash: number
    status: string
    openedAt: string
    closedAt?: string | null
    expectedCash?: number | null
    countedCash?: number | null
    varianceCash?: number | null
}

/** Money collected during a shift, per tender method. */
export type PosSessionCollections = {
    byMethod: Record<string, number>
    cashCollected: number
    cashChange: number
    tenderCount: number
}

/** Parked (held) sale: the cart snapshot owned by the terminal. */
export type PosHold = {
    id: string
    payload: Record<string, unknown>
    status: string
    customerName?: string | null
    createdAt: string
}

export type PosReceiptLine = {
    sku: string
    description: string | null
    variantName: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    taxRate: number
    taxIncluded: number
    taxAdded: number
}

export type PosReceiptTender = {
    method: string
    amount: number
    tenderAmount: number
    changeAmount: number
    referenceNumber: string | null
    status: string
    verificationStatus: string
}

/** The server receipt — the only authority for the totals of a sale. */
export type PosReceipt = {
    receiptNumber: string
    salesOrderId: string
    orderNumber: string
    status: string
    completedAt: string
    branchId: string
    posSessionId: string | null
    cashierUserId: string | null
    customerName: string | null
    lines: PosReceiptLine[]
    subtotal: number
    discountAmount: number
    taxAmount: number
    taxIncludedAmount: number
    total: number
    tendered: number
    change: number
    tenders: PosReceiptTender[]
    warnings: string[]
}

/** Server quote of a running cart: the amount the checkout will ask for. */
export type PosQuote = {
    subtotal: number
    discountAmount: number
    taxAmount: number
    taxIncludedAmount: number
    total: number
    lines: Array<{
        sku: string
        description: string
        variantName: string | null
        quantity: number
        unitPrice: number
        lineTotal: number
        taxRate: number
        taxTreatment: string | null
        taxIncluded: number
        taxAdded: number
    }>
    warnings: string[]
}

type DecimalString = string | number | null

const num = (value: DecimalString | undefined) => Number(value ?? 0)

const toSession = (row: {
    id: string
    companyId: string
    branchId: string
    terminalCode: string
    cashierUserId: string
    openingCash: DecimalString
    status: string
    openedAt: string
    closedAt?: string | null
    expectedCash?: DecimalString
    countedCash?: DecimalString
    varianceCash?: DecimalString
}): PosSession => ({
    ...row,
    openingCash: num(row.openingCash),
    expectedCash: row.expectedCash === null ? null : num(row.expectedCash),
    countedCash: row.countedCash === null ? null : num(row.countedCash),
    varianceCash: row.varianceCash === null ? null : num(row.varianceCash),
})

const toHold = (row: {
    id: string
    payload: Record<string, unknown>
    status: string
    customerName?: string | null
    createdAt: string
}): PosHold => ({
    id: row.id,
    payload: row.payload ?? {},
    status: row.status,
    customerName: row.customerName ?? null,
    createdAt: row.createdAt,
})

/**
 * Prices the cart from the SD product catalog.
 *
 * The terminal prices the cart for the preview only; the backend re-verifies
 * every unit price, the totals and the tax before the sale exists.
 */
export async function pricePOSCart(
    items: ReadonlyArray<{
        sku: string
        quantity: number
        variantId?: string
        variantName?: string
        unitPrice?: number
    }>,
    divisionId: SalesDivisionId = RETAIL_DIVISION_ID,
): Promise<{ lines: POSCheckoutLine[]; subtotal: number }> {
    await loadPricingCatalog(divisionId)
    return priceLines(items, divisionId)
}

/** Opens the cashier shift of a register (POST /sd/pos/sessions). */
export async function openPosSession(input: {
    companyId: string
    branchId: string
    terminalCode: string
    cashierUserId: string
    openingCash?: number
    notes?: string
}): Promise<PosSession> {
    try {
        const { data } = await ErpAxiosBase.post<PosSession>(
            '/sd/pos/sessions',
            {
                companyId: input.companyId,
                branchId: input.branchId,
                terminalCode: input.terminalCode.trim(),
                cashierUserId: input.cashierUserId,
                openingCash: input.openingCash ?? 0,
                notes: input.notes,
            },
        )
        return toSession(data)
    } catch (error) {
        throw toApiError(error, 'Unable to open the shift')
    }
}

/** The shift currently open on the branch (GET /sd/pos/sessions/current). */
export async function getCurrentPosSession(
    companyId: string,
    branchId?: string | null,
    terminalCode?: string | null,
): Promise<PosSession | null> {
    try {
        const { data } = await ErpAxiosBase.get<PosSession | null>(
            '/sd/pos/sessions/current',
            {
                params: {
                    companyId,
                    branchId: branchId || undefined,
                    terminalCode: terminalCode || undefined,
                },
            },
        )
        return data ? toSession(data) : null
    } catch (error) {
        throw toApiError(error, 'Unable to load the shift')
    }
}

/** Money collected during a shift (GET /sd/pos/sessions/:id/collections). */
export async function getPosSessionCollections(
    sessionId: string,
): Promise<PosSessionCollections> {
    try {
        const { data } = await ErpAxiosBase.get<PosSessionCollections>(
            `/sd/pos/sessions/${encodeURIComponent(sessionId)}/collections`,
        )
        return {
            byMethod: data.byMethod ?? {},
            cashCollected: num(data.cashCollected),
            cashChange: num(data.cashChange),
            tenderCount: num(data.tenderCount),
        }
    } catch (error) {
        throw toApiError(error, 'Unable to load the shift collections')
    }
}

/** Closes the shift and reconciles the counted cash (POST .../close). */
export async function closePosSession(
    sessionId: string,
    input: { countedCash: number; notes?: string },
): Promise<PosSession> {
    try {
        const { data } = await ErpAxiosBase.post<PosSession>(
            `/sd/pos/sessions/${encodeURIComponent(sessionId)}/close`,
            { countedCash: input.countedCash, notes: input.notes },
        )
        return toSession(data)
    } catch (error) {
        throw toApiError(error, 'Unable to close the shift')
    }
}

/**
 * Prices the cart on the server: prices, discount and the MM tax
 * configuration. The terminal uses the quoted total as the amount due.
 */
export async function quotePosCart(payload: {
    companyId: string
    divisionId: string
    discountAmount?: number
    lines: Array<{
        sku: string
        variantId?: string
        variantName?: string
        description?: string
        quantity: number
        unitPrice: number
    }>
}): Promise<PosQuote> {
    try {
        const { data } = await ErpAxiosBase.post<PosQuote>('/sd/pos/quote', {
            companyId: payload.companyId,
            divisionId: payload.divisionId,
            discountAmount: payload.discountAmount,
            lines: payload.lines,
        })
        return {
            ...data,
            subtotal: num(data.subtotal),
            discountAmount: num(data.discountAmount),
            taxAmount: num(data.taxAmount),
            taxIncludedAmount: num(data.taxIncludedAmount),
            total: num(data.total),
            warnings: data.warnings ?? [],
        }
    } catch (error) {
        throw toApiError(error, 'Unable to price the cart')
    }
}

/**
 * The Customer Master record of a name typed at the register: the existing
 * customer, or a new one created for a first-time buyer.
 */
export async function createPosCustomer(input: {
    name: string
    contactName?: string
    email?: string
    phone?: string
    customerAccountType?: 'NON_CREDIT' | 'CREDIT'
    creditLimit?: number
    createdBy?: string | null
}): Promise<{
    id: string
    companyName: string
    customerNumber: string
    customerAccountType: string
}> {
    try {
        const { data } = await ErpAxiosBase.post<{
            id: string
            companyName: string
            customerNumber: string
            customerAccountType: string
        }>('/sd/pos/customers', {
            name: input.name.trim(),
            contactName: input.contactName ?? undefined,
            email: input.email ?? undefined,
            phone: input.phone ?? undefined,
            customerAccountType: input.customerAccountType ?? 'NON_CREDIT',
            creditLimit: input.creditLimit ?? undefined,
            createdBy: input.createdBy ?? undefined,
        })
        return data
    } catch (error) {
        throw toApiError(error, 'Unable to add the customer')
    }
}

/** Completes the sale: tenders, goods issue, receipt (POST /sd/pos/checkout). */
export async function completePosCheckout(
    payload: PosCheckoutPayload,
): Promise<PosReceipt> {
    try {
        const body = PosCheckoutPayloadSchema.parse(payload)
        const { data } = await ErpAxiosBase.post<PosReceipt>(
            '/sd/pos/checkout',
            body,
        )
        return data
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message ?? 'Invalid sale data')
        }
        throw toApiError(error, 'Unable to complete the sale')
    }
}

/** Parks the cart while another customer is served (POST /sd/pos/holds). */
export async function holdPosSale(input: {
    companyId: string
    branchId?: string | null
    posSessionId?: string | null
    customerName?: string | null
    payload: Record<string, unknown>
    createdBy?: string | null
}): Promise<PosHold> {
    try {
        const { data } = await ErpAxiosBase.post<PosHold>('/sd/pos/holds', {
            companyId: input.companyId,
            branchId: input.branchId || undefined,
            posSessionId: input.posSessionId || undefined,
            customerName: input.customerName || undefined,
            payload: input.payload,
            createdBy: input.createdBy || undefined,
        })
        return toHold(data)
    } catch (error) {
        throw toApiError(error, 'Unable to hold the sale')
    }
}

/** Held sales of a company (GET /sd/pos/holds). */
export async function listPosHolds(params: {
    companyId: string
    branchId?: string | null
    status?: string
}): Promise<PosHold[]> {
    try {
        const { data } = await ErpAxiosBase.get<PosHold[]>('/sd/pos/holds', {
            params: {
                companyId: params.companyId,
                branchId: params.branchId || undefined,
                status: params.status,
            },
        })
        return data.map(toHold)
    } catch (error) {
        throw toApiError(error, 'Unable to load the held sales')
    }
}

/** Takes a held sale back into the cart (POST /sd/pos/holds/:id/resume). */
export async function resumePosHold(id: string): Promise<PosHold> {
    try {
        const { data } = await ErpAxiosBase.post<PosHold>(
            `/sd/pos/holds/${encodeURIComponent(id)}/resume`,
            {},
        )
        return toHold(data)
    } catch (error) {
        throw toApiError(error, 'Unable to resume the held sale')
    }
}

/** Drops a held sale (POST /sd/pos/holds/:id/discard). */
export async function discardPosHold(id: string): Promise<PosHold> {
    try {
        const { data } = await ErpAxiosBase.post<PosHold>(
            `/sd/pos/holds/${encodeURIComponent(id)}/discard`,
            {},
        )
        return toHold(data)
    } catch (error) {
        throw toApiError(error, 'Unable to discard the held sale')
    }
}

export { newIdempotencyKey }
