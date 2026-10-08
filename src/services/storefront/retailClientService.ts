import { isAxiosError } from 'axios'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CartItem,
    RetailProduct,
    SalesOrderShippingDetails,
} from '@/types/storefront/retail'

export type RetailClientProfile = SalesOrderShippingDetails & {
    customerId: string
    firstName: string
}

/** Signed-in shopper: profile plus the bearer token the API issued. */
export type RetailClientSession = {
    client: RetailClientProfile
    token: string
    /** ISO timestamp; the token is rejected after this. */
    expiresAt: string
}

export type RetailRegisterPayload = {
    email: string
    firstName: string
    password: string
}

/** Keeps shared storefront profile dialogs source-compatible during migration. */
export type RetailProfileUpdate = Partial<SalesOrderShippingDetails> & {
    firstName?: string
}

export type RetailClientAddress = {
    id: string
    addressType: 'HOME' | 'WORK'
    formattedAddress: string | null
    addressLine: string | null
    barangayOrNeighborhood: string | null
    cityOrMunicipality: string | null
    provinceOrState: string | null
    postalCode: string | null
    country: string | null
    latitude: number
    longitude: number
    additionalInfo: string | null
    isDefault: boolean
    createdAt: string
    updatedAt: string
}

export type RetailAddressPayload = Omit<
    RetailClientAddress,
    'id' | 'createdAt' | 'updatedAt'
>

export type RetailGeocodedAddress = Pick<
    RetailAddressPayload,
    | 'formattedAddress'
    | 'addressLine'
    | 'barangayOrNeighborhood'
    | 'cityOrMunicipality'
    | 'provinceOrState'
    | 'postalCode'
    | 'country'
>

export type RetailPlaceSuggestion = {
    id: string
    label: string
    address: string
    lat: number
    lng: number
    city: string | null
    postalCode: string | null
    country: string | null
}

export type RetailLoginPayload = {
    email: string
    password: string
}

type ApiClient = {
    customerId: string
    email: string
    firstName: string
    fullName: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country: string
}

type ApiSession = { client: ApiClient; token: string; expiresAt: string }

type CartApiItem = {
    sku: string
    quantity: number
    product: RetailProduct | Record<string, unknown>
}

/** The shopper's session is missing, expired or no longer valid; sign in again. */
export class RetailSessionExpiredError extends Error {
    constructor(message = 'Your session has expired. Please sign in again.') {
        super(message)
        this.name = 'RetailSessionExpiredError'
    }
}

export const isSessionRejected = (error: unknown) =>
    isAxiosError(error) && error.response?.status === 401

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

const toProfile = (client: ApiClient): RetailClientProfile => ({
    customerId: client.customerId,
    email: client.email,
    firstName: client.firstName,
    fullName: client.fullName,
    phone: client.phone,
    addressLine1: client.addressLine1,
    city: client.city,
    region: client.region,
    postalCode: client.postalCode,
    country: client.country,
})

const toSession = (data: ApiSession): RetailClientSession => ({
    client: toProfile(data.client),
    token: data.token,
    expiresAt: data.expiresAt,
})

/** Rethrows a 401 as `RetailSessionExpiredError`; other errors pass through. */
async function authed<T>(request: Promise<T>): Promise<T> {
    try {
        return await request
    } catch (error) {
        if (isSessionRejected(error)) throw new RetailSessionExpiredError()
        throw error
    }
}

export async function registerRetailClient(
    payload: RetailRegisterPayload,
): Promise<RetailClientSession> {
    const { data } = await ErpAxiosBase.post<ApiSession>(
        '/retail/clients/register',
        {
            email: payload.email,
            password: payload.password,
            firstName: payload.firstName,
        },
    )
    return toSession(data)
}

export async function loginRetailClient(
    payload: RetailLoginPayload,
): Promise<RetailClientSession> {
    const { data } = await ErpAxiosBase.post<ApiSession>(
        '/retail/clients/login',
        payload,
    )
    return toSession(data)
}

export async function updateRetailClientProfile(
    token: string,
    profile: RetailProfileUpdate,
): Promise<RetailClientProfile> {
    const firstName = profile.firstName ?? profile.fullName
    const { data } = await authed(
        ErpAxiosBase.patch<{ client: ApiClient }>(
            '/retail/clients/me',
            {
                ...(firstName !== undefined && { firstName }),
                ...(profile.phone !== undefined && { phone: profile.phone }),
            },
            { headers: bearer(token) },
        ),
    )
    return toProfile(data.client)
}

export async function fetchRetailClientProfile(
    token: string,
): Promise<RetailClientProfile> {
    const { data } = await authed(
        ErpAxiosBase.get<ApiClient>('/retail/clients/me', {
            headers: bearer(token),
        }),
    )
    return toProfile(data)
}

export async function fetchRetailClientAddresses(
    token: string,
): Promise<RetailClientAddress[]> {
    const { data } = await authed(
        ErpAxiosBase.get<RetailClientAddress[]>(
            '/retail/clients/me/addresses',
            {
                headers: bearer(token),
            },
        ),
    )
    return data
}

export async function createRetailClientAddress(
    token: string,
    payload: RetailAddressPayload,
): Promise<RetailClientAddress> {
    const { data } = await authed(
        ErpAxiosBase.post<RetailClientAddress>(
            '/retail/clients/me/addresses',
            payload,
            { headers: bearer(token) },
        ),
    )
    return data
}

export async function updateRetailClientAddress(
    token: string,
    addressId: string,
    payload: Partial<RetailAddressPayload>,
): Promise<RetailClientAddress> {
    const { data } = await authed(
        ErpAxiosBase.patch<RetailClientAddress>(
            `/retail/clients/me/addresses/${encodeURIComponent(addressId)}`,
            payload,
            { headers: bearer(token) },
        ),
    )
    return data
}

export async function deleteRetailClientAddress(
    token: string,
    addressId: string,
): Promise<void> {
    await authed(
        ErpAxiosBase.delete(
            `/retail/clients/me/addresses/${encodeURIComponent(addressId)}`,
            { headers: bearer(token) },
        ),
    )
}

export async function setRetailClientDefaultAddress(
    token: string,
    addressId: string,
): Promise<RetailClientAddress> {
    const { data } = await authed(
        ErpAxiosBase.patch<RetailClientAddress>(
            `/retail/clients/me/addresses/${encodeURIComponent(addressId)}/default`,
            undefined,
            { headers: bearer(token) },
        ),
    )
    return data
}

export async function searchRetailAddress(
    token: string,
    query: string,
): Promise<RetailPlaceSuggestion[]> {
    const { data } = await authed(
        ErpAxiosBase.get<RetailPlaceSuggestion[]>(
            '/retail/clients/me/addresses/geocode/search',
            { params: { q: query, limit: 5 }, headers: bearer(token) },
        ),
    )
    return data
}

export async function reverseRetailAddress(
    token: string,
    latitude: number,
    longitude: number,
): Promise<RetailGeocodedAddress> {
    const { data } = await authed(
        ErpAxiosBase.get<RetailGeocodedAddress>(
            '/retail/clients/me/addresses/geocode/reverse',
            {
                params: { lat: latitude, lng: longitude },
                headers: bearer(token),
            },
        ),
    )
    return data
}

export async function fetchRetailClientCart(
    token: string,
): Promise<CartItem[]> {
    const { data } = await authed(
        ErpAxiosBase.get<{ items: CartApiItem[] }>('/retail/clients/cart', {
            headers: bearer(token),
        }),
    )
    return data.items.map((item) => ({
        product: item.product as RetailProduct,
        quantity: Math.max(1, item.quantity),
    }))
}

export async function saveRetailClientCart(
    token: string,
    items: CartItem[],
): Promise<void> {
    await authed(
        ErpAxiosBase.put(
            '/retail/clients/cart',
            {
                items: items.map((item) => ({
                    sku: item.product.sku,
                    quantity: item.quantity,
                    product: item.product,
                })),
            },
            { headers: bearer(token) },
        ),
    )
}
