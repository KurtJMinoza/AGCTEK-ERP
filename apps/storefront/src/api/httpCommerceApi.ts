import type {
    Availability,
    AvailabilityState,
    CheckoutInput,
    CheckoutResult,
    Customer,
    Order,
    OrderStatus,
    Product,
    ProfileUpdate,
    RegisterInput,
    Review,
    SignInInput,
    Spec,
} from '../types'
import { CommerceApiError, type CommerceApi } from './commerceApi'

/** Nest global prefix — must match backend `app.setGlobalPrefix('api/v1')`. */
const API_PREFIX = '/api/v1'

type Decimal = string | number | null

type ApiProduct = {
    id: string
    divisionId: string
    sku: string
    name: string
    description: string | null
    price: Decimal
    originalPrice: Decimal
    category: string | null
    imageUrl: string | null
    badge: string | null
    attributes: Record<string, unknown> | null
}

type ApiClient = Customer

type ApiSalesOrder = {
    id: string
    orderNumber: string
    divisionId: string | null
    status: string
    subtotal: Decimal
    discountAmount: Decimal
    promoCode: string | null
    shippingAmount: Decimal
    totalAmount: Decimal
    createdAt: string
    updatedAt: string
    shipToName: string | null
    shipToPhone: string | null
    shipToAddressLine1: string | null
    shipToCity: string | null
    shipToRegion: string | null
    shipToPostalCode: string | null
    lines: {
        divisionId: string | null
        sku: string
        description: string | null
        quantity: Decimal
        unitPrice: Decimal
        lineTotal: Decimal
    }[]
}

const STATUS_MAP: Record<string, OrderStatus> = {
    DRAFT: 'PROCESSING',
    CONFIRMED: 'TO_BE_DELIVERED',
    COMPLETED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
}

const toNumber = (value: Decimal) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
}

const strings = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        : []

const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null

/**
 * SD + retail endpoints shared with the web marketplace. They need no auth
 * header; the signed-in customer is identified by `customerId`.
 */
export class HttpCommerceApi implements CommerceApi {
    /**
     * @param baseUrl Nest API origin, e.g. http://192.168.1.10:3011
     * @param webUrl Next.js origin serving uploaded product images (`/uploads/...`)
     */
    constructor(
        private readonly baseUrl: string,
        private readonly webUrl: string,
    ) {}

    async getProducts(): Promise<Product[]> {
        const rows = await this.request<ApiProduct[]>('/sd/products?activeOnly=true')
        return rows.map((row) => this.toProduct(row))
    }

    async getAvailability(divisionId: string, sku: string): Promise<Availability> {
        const query = new URLSearchParams({ divisionId, sku }).toString()
        const result = await this.request<{
            availableQuantity: number
            state?: AvailabilityState
        }>(`/sd/products/storefront/availability?${query}`)
        const availableQuantity = Math.max(0, Math.floor(toNumber(result.availableQuantity)))
        return {
            availableQuantity,
            state: result.state ?? (availableQuantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'),
        }
    }

    async signIn(input: SignInInput): Promise<Customer> {
        const { client } = await this.request<{ client: ApiClient }>(
            '/retail/clients/login',
            { method: 'POST', body: JSON.stringify(input) },
        )
        return client
    }

    async register(input: RegisterInput): Promise<Customer> {
        const { client } = await this.request<{ client: ApiClient }>(
            '/retail/clients/register',
            { method: 'POST', body: JSON.stringify(input) },
        )
        return client
    }

    async updateProfile(customerId: string, update: ProfileUpdate): Promise<Customer> {
        const { client } = await this.request<{ client: ApiClient }>(
            '/retail/clients/me',
            { method: 'PATCH', body: JSON.stringify({ clientId: customerId, ...update }) },
        )
        return client
    }

    async checkout({ checkoutId, customerId, shipping, pricing }: CheckoutInput): Promise<CheckoutResult> {
        const { email, ...address } = shipping
        const result = await this.request<{ checkoutId: string; order: ApiSalesOrder }>(
            '/sd/sales-orders/retail/checkout',
            {
                method: 'POST',
                body: JSON.stringify({
                    checkoutId,
                    customerId,
                    customerName: shipping.fullName,
                    customerEmail: email,
                    shippingAddress: address,
                    cartItems: pricing.stores.flatMap((store) =>
                        store.lines.map((line) => ({
                            divisionId: store.divisionId,
                            sku: line.sku,
                            description: line.name,
                            quantity: line.quantity,
                            unitPrice: line.unitPrice,
                            lineTotal: line.lineTotal,
                        })),
                    ),
                    subtotal: pricing.subtotal,
                    discountAmount: pricing.discountAmount,
                    ...(pricing.promoCode ? { promoCode: pricing.promoCode } : {}),
                    shippingAmount: pricing.shipping,
                    totalAmount: pricing.grandTotal,
                }),
            },
        )
        return {
            checkoutId: result.checkoutId,
            orderId: result.order.id,
            orderNumber: result.order.orderNumber,
            grandTotal: toNumber(result.order.totalAmount),
            stores: pricing.stores,
        }
    }

    async getOrders(customerId: string): Promise<Order[]> {
        const rows = await this.request<ApiSalesOrder[]>(
            `/sd/sales-orders?${new URLSearchParams({ customerId }).toString()}`,
        )
        return rows.map((row) => this.toOrder(row))
    }

    private imageUrl(src: unknown): string | null {
        const value = typeof src === 'string' ? src.trim() : ''
        if (!value || value.split('?')[0].toLowerCase().endsWith('.svg')) return null
        if (/^https?:\/\//.test(value)) return value
        if (value.startsWith('/') && !value.startsWith('//')) return `${this.webUrl}${value}`
        return null
    }

    private toProduct(row: ApiProduct): Product {
        const attrs = row.attributes ?? {}
        const images = [
            ...new Set(
                [row.imageUrl, ...strings(attrs.images), ...strings(attrs.gallery)]
                    .map((src) => this.imageUrl(src))
                    .filter((src): src is string => src !== null),
            ),
        ]
        const specs: Spec[] = (Array.isArray(attrs.specs) ? attrs.specs : [])
            .filter(
                (spec): spec is { label: string; value: unknown } =>
                    typeof spec === 'object' &&
                    spec !== null &&
                    typeof (spec as Spec).label === 'string' &&
                    (spec as Spec).value !== undefined,
            )
            .map((spec) => ({ label: spec.label, value: String(spec.value) }))
        const brand = text(attrs.brand)
        const weightKg = typeof attrs.weightKg === 'number' ? attrs.weightKg : null
        const warranty = text(attrs.warranty)
        const category = row.category?.trim() || 'General Goods'
        const reviews: Review[] = (Array.isArray(attrs.reviews) ? attrs.reviews : [])
            .filter(
                (review): review is Review =>
                    typeof review === 'object' &&
                    review !== null &&
                    typeof (review as Review).rating === 'number',
            )
            .map((review, index) => ({ ...review, id: String(review.id ?? index) }))

        return {
            id: row.id,
            divisionId: row.divisionId,
            sku: row.sku,
            name: row.name,
            description: row.description?.trim() ?? '',
            category,
            price: toNumber(row.price),
            originalPrice: row.originalPrice === null ? null : toNumber(row.originalPrice),
            badge: row.badge?.trim() || null,
            images,
            tagline: text(attrs.tagline),
            details: text(attrs.details),
            features: [...strings(attrs.features), ...strings(attrs.keyFeatures)],
            inclusions: [...strings(attrs.inclusions), ...strings(attrs.includes)],
            specs: [
                ...(brand ? [{ label: 'Brand', value: brand }] : []),
                ...specs,
                ...(weightKg !== null ? [{ label: 'LPG content', value: `${weightKg} kg` }] : []),
                { label: 'Category', value: category },
                { label: 'SKU', value: row.sku },
                ...(warranty ? [{ label: 'Warranty', value: warranty }] : []),
            ],
            reviews,
            warranty,
            isAddon: attrs.addOn === true || category === 'Add-on',
        }
    }

    private toOrder(row: ApiSalesOrder): Order {
        const address = [
            row.shipToAddressLine1,
            row.shipToCity,
            row.shipToRegion,
            row.shipToPostalCode,
        ]
            .filter(Boolean)
            .join(', ')
        const lines = row.lines.map((line) => ({
            divisionId: line.divisionId ?? row.divisionId,
            sku: line.sku,
            name: line.description ?? line.sku,
            quantity: toNumber(line.quantity),
            unitPrice: toNumber(line.unitPrice),
            lineTotal: toNumber(line.lineTotal),
        }))
        return {
            id: row.id,
            orderNumber: row.orderNumber,
            divisionIds: [
                ...new Set(
                    lines
                        .map((line) => line.divisionId)
                        .filter((id): id is string => Boolean(id)),
                ),
            ],
            status: STATUS_MAP[row.status] ?? 'PROCESSING',
            placedAt: row.createdAt,
            updatedAt: row.updatedAt,
            lines,
            subtotal: toNumber(row.subtotal),
            discountAmount: toNumber(row.discountAmount),
            promoCode: row.promoCode,
            shippingAmount: toNumber(row.shippingAmount),
            totalAmount: toNumber(row.totalAmount),
            shipTo: row.shipToName
                ? { fullName: row.shipToName, phone: row.shipToPhone ?? '', address }
                : null,
        }
    }

    private async request<T>(path: string, init?: RequestInit): Promise<T> {
        let res: Response
        try {
            res = await fetch(`${this.baseUrl}${API_PREFIX}${path}`, {
                ...init,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(init?.headers ?? {}),
                },
            })
        } catch {
            throw new CommerceApiError(
                `Can't reach the store right now (${this.baseUrl}). Check your connection and try again.`,
                'NETWORK',
            )
        }

        const raw = await res.text()
        let body: unknown = null
        try {
            body = raw ? JSON.parse(raw) : null
        } catch {
            body = raw
        }

        if (!res.ok) {
            const message = (body as { message?: string | string[] } | null)?.message
            const text = Array.isArray(message)
                ? message.join('; ')
                : message || `Request failed (${res.status})`
            const code =
                res.status === 404
                    ? 'NOT_FOUND'
                    : res.status === 409
                      ? 'CONFLICT'
                      : res.status >= 500
                        ? 'NETWORK'
                        : 'VALIDATION'
            throw new CommerceApiError(text, code)
        }
        return body as T
    }
}
