import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    CartItem,
    RetailProduct,
    SalesOrderShippingDetails,
} from '@/types/storefront/retail'

export type RetailClientProfile = SalesOrderShippingDetails & {
    customerId: string
}

export type RetailRegisterPayload = SalesOrderShippingDetails & {
    password: string
}

export type RetailLoginPayload = {
    email: string
    password: string
}

type ApiClient = {
    customerId: string
    email: string
    fullName: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country: string
}

type CartApiItem = {
    sku: string
    quantity: number
    product: RetailProduct | Record<string, unknown>
}

/** Saved shipping address from the multi-address book. */
export type RetailAddress = {
    id: string
    label: string | null
    fullName: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country: string
    isDefault: boolean
    createdAt: string
    updatedAt: string
}

/** Payload for creating a new saved address. */
export type RetailAddressInput = {
    label?: string
    fullName: string
    phone: string
    addressLine1: string
    city: string
    region: string
    postalCode: string
    country?: string
}

const toProfile = (client: ApiClient): RetailClientProfile => ({
    customerId: client.customerId,
    email: client.email,
    fullName: client.fullName,
    phone: client.phone,
    addressLine1: client.addressLine1,
    city: client.city,
    region: client.region,
    postalCode: client.postalCode,
    country: client.country,
})

export async function registerRetailClient(
    payload: RetailRegisterPayload,
): Promise<RetailClientProfile> {
    const { data } = await ErpAxiosBase.post<{ client: ApiClient }>(
        '/retail/clients/register',
        {
            email: payload.email,
            password: payload.password,
            fullName: payload.fullName,
            phone: payload.phone,
            addressLine1: payload.addressLine1,
            city: payload.city,
            region: payload.region,
            postalCode: payload.postalCode,
            country: payload.country,
        },
    )
    return toProfile(data.client)
}

export async function loginRetailClient(
    payload: RetailLoginPayload,
): Promise<RetailClientProfile> {
    const { data } = await ErpAxiosBase.post<{ client: ApiClient }>(
        '/retail/clients/login',
        payload,
    )
    return toProfile(data.client)
}

export async function updateRetailClientProfile(
    clientId: string,
    profile: Partial<SalesOrderShippingDetails>,
): Promise<RetailClientProfile> {
    const { data } = await ErpAxiosBase.patch<{ client: ApiClient }>(
        '/retail/clients/me',
        { clientId, ...profile },
    )
    return toProfile(data.client)
}

export async function fetchRetailClientCart(
    clientId: string,
): Promise<CartItem[]> {
    const { data } = await ErpAxiosBase.get<{ items: CartApiItem[] }>(
        '/retail/clients/cart',
        { params: { clientId } },
    )
    return data.items.map((item) => ({
        product: item.product as RetailProduct,
        quantity: Math.max(1, item.quantity),
    }))
}

export async function saveRetailClientCart(
    clientId: string,
    items: CartItem[],
): Promise<void> {
    await ErpAxiosBase.put('/retail/clients/cart', {
        clientId,
        items: items.map((item) => ({
            sku: item.product.sku,
            quantity: item.quantity,
            product: item.product,
        })),
    })
}

// ── Multi-address book ─────────────────────────────────────────────────────

const getAddress = (data: { address: RetailAddress }): RetailAddress => data.address

export async function listRetailClientAddresses(
    clientId: string,
): Promise<RetailAddress[]> {
    const { data } = await ErpAxiosBase.get<{ addresses: RetailAddress[] }>(
        `/retail/clients/${encodeURIComponent(clientId)}/addresses`,
    )
    return data.addresses
}

export async function createRetailClientAddress(
    clientId: string,
    input: RetailAddressInput,
): Promise<RetailAddress> {
    const { data } = await ErpAxiosBase.post<{ address: RetailAddress }>(
        `/retail/clients/${encodeURIComponent(clientId)}/addresses`,
        input,
    )
    return getAddress(data)
}

export async function setDefaultRetailClientAddress(
    addressId: string,
): Promise<RetailAddress> {
    const { data } = await ErpAxiosBase.post<{ address: RetailAddress }>(
        `/retail/clients/addresses/${encodeURIComponent(addressId)}/default`,
    )
    return getAddress(data)
}

export async function deleteRetailClientAddress(
    addressId: string,
): Promise<void> {
    await ErpAxiosBase.delete(
        `/retail/clients/addresses/${encodeURIComponent(addressId)}`,
    )
}

/** Address-book entry as checkout shipping details (email from the account). */
export const addressToShipping = (
    address: RetailAddress,
    email: string,
): SalesOrderShippingDetails => ({
    fullName: address.fullName,
    email,
    phone: address.phone,
    addressLine1: address.addressLine1,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country || 'PH',
})
