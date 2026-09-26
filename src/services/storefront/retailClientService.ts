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
    return data.items.map((item) => {
        const product = item.product as RetailProduct
        const quantity = Math.max(1, item.quantity)
        return {
            product,
            quantity,
            itemTotal: Number((product.basePrice * quantity).toFixed(2)),
        }
    })
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
