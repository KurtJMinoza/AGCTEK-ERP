import type {
    Availability,
    AvailabilityState,
    CheckoutInput,
    CheckoutResult,
    Customer,
    Notification,
    Order,
    OrderStatus,
    OrderTracking,
    Product,
    ProfileUpdate,
    RegisterInput,
    ReturnRequest,
    Review,
    SavedAddress,
    SavedAddressInput,
    SignInInput,
    Spec,
    TrackingLink,
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
    paymentMethod: string | null
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

type ApiNotification = {
    id: string
    title?: string | null
    message?: string | null
    description?: string | null
    target?: string | null
    location?: string | null
    isRead?: boolean
    readed?: boolean
    createdAt?: string | null
    date?: string | null
}

type ApiAddress = {
    id: string
    addressType?: string | null
    label?: string | null
    addressLine?: string | null
    barangayOrNeighborhood?: string | null
    cityOrMunicipality?: string | null
    provinceOrState?: string | null
    postalCode?: string | null
    country?: string | null
    formattedAddress?: string | null
    latitude?: number | null
    longitude?: number | null
    isDefault?: boolean
    additionalInfo?: string | null
}

const STATUS_MAP: Record<string, OrderStatus> = {
    DRAFT: 'PENDING_APPROVAL',
    PENDING: 'PENDING_APPROVAL',
    CONFIRMED: 'PREPARING_TO_SHIP',
    DISPATCHED: 'DISPATCHED',
    READY_FOR_DISPATCH: 'DISPATCHED',
    DELIVERED: 'DELIVERED',
    COMPLETED: 'COMPLETED',
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

type ApiSession = { client: ApiClient; token: string; expiresAt: string }

/**
 * SD + retail endpoints shared with the web marketplace. Account and checkout
 * calls send the shopper's session token as a bearer header.
 */
export class HttpCommerceApi implements CommerceApi {
    private sessionToken: string | null = null

    /**
     * @param baseUrl Nest API origin, e.g. http://192.168.1.10:3011
     * @param webUrl Next.js origin serving uploaded product images (`/uploads/...`)
     */
    constructor(
        private readonly baseUrl: string,
        private readonly webUrl: string,
    ) {}

    getSessionToken(): string | null {
        return this.sessionToken
    }

    setSessionToken(token: string | null): void {
        this.sessionToken = token
    }

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
        const { client, token } = await this.request<ApiSession>(
            '/retail/clients/login',
            { method: 'POST', body: JSON.stringify(input) },
        )
        this.sessionToken = token
        return client
    }

    async register(input: RegisterInput): Promise<Customer> {
        const firstName = input.fullName?.trim() || ''
        const { client, token } = await this.request<ApiSession>(
            '/retail/clients/register',
            {
                method: 'POST',
                body: JSON.stringify({
                    email: input.email.trim().toLowerCase(),
                    password: input.password,
                    firstName,
                    fullName: firstName,
                }),
            },
        )
        this.sessionToken = token

        if (input.phone) {
            try {
                await this.updateProfile(client.customerId, {
                    fullName: input.fullName,
                    phone: input.phone,
                    addressLine1: input.addressLine1,
                    city: input.city,
                    region: input.region,
                    postalCode: input.postalCode,
                    country: input.country,
                })
            } catch {
                // Non-blocking: registration itself succeeded
            }
        }
        return client
    }

    async updateProfile(_customerId: string, update: ProfileUpdate): Promise<Customer> {
        const firstName = update.fullName?.trim() || ''
        const { client } = await this.request<{ client: ApiClient }>(
            '/retail/clients/me',
            {
                method: 'PATCH',
                body: JSON.stringify({
                    ...(firstName ? { firstName, fullName: firstName } : {}),
                    ...(update.phone ? { phone: update.phone } : {}),
                }),
            },
        )
        return client
    }

    async checkout({ checkoutId, customerId, shipping, pricing, paymentMethod }: CheckoutInput): Promise<CheckoutResult> {
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
                    paymentMethod: paymentMethod ?? 'CASH_ON_DELIVERY',
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
            paymentMethod,
            stores: pricing.stores,
        }
    }

    async getOrders(customerId: string): Promise<Order[]> {
        const rows = await this.request<ApiSalesOrder[]>(
            `/sd/sales-orders?${new URLSearchParams({ customerId }).toString()}`,
        )
        return rows.map((row) => this.toOrder(row))
    }

    async cancelOrder(orderId: string, reason?: string): Promise<void> {
        await this.request<ApiSalesOrder>(
            `/sd/sales-orders/${encodeURIComponent(orderId)}/cancel`,
            {
                method: 'POST',
                body: JSON.stringify({ reason: reason?.trim() || 'Customer requested' }),
            },
        )
    }

    async requestReturn({ orderId, reason, notes }: ReturnRequest): Promise<void> {
        await this.request<unknown>(
            `/sd/sales-orders/${encodeURIComponent(orderId)}/return`,
            {
                method: 'POST',
                body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
            },
        )
    }

    async getOrderTracking(orderId: string): Promise<OrderTracking> {
        return this.request<OrderTracking>(
            `/sd/sales-orders/retail/${encodeURIComponent(orderId)}/tracking`,
        )
    }

    async createTrackingLink(orderId: string): Promise<TrackingLink> {
        return this.request<TrackingLink>(
            `/sd/sales-orders/retail/${encodeURIComponent(orderId)}/tracking-link`,
            { method: 'POST', body: '{}' },
        )
    }

    // ─── Notifications ─────────────────────────────────────────────────────────
    // Signed-in shoppers read their own inbox (session-scoped); the legacy
    // userId query is kept only for the signed-out case.

    async getNotifications(userId?: string): Promise<Notification[]> {
        const path = this.sessionToken
            ? '/retail/notifications'
            : `/notifications${userId ? `?${new URLSearchParams({ userId }).toString()}` : ''}`
        try {
            const rows = await this.request<ApiNotification[]>(path)
            return rows.map(this.toNotification)
        } catch {
            return []
        }
    }

    async markNotificationRead(id: string): Promise<void> {
        const base = this.sessionToken ? '/retail/notifications' : '/notifications'
        await this.request<unknown>(`${base}/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
    }

    async markAllNotificationsRead(userId?: string): Promise<void> {
        if (this.sessionToken) {
            await this.request<unknown>('/retail/notifications/read-all', { method: 'PATCH' })
            return
        }
        const body = userId ? JSON.stringify({ userId }) : '{}'
        await this.request<unknown>('/notifications/mark-all-read', { method: 'POST', body })
    }

    // ─── Saved Addresses ───────────────────────────────────────────────────────

    async getAddresses(): Promise<SavedAddress[]> {
        const rows = await this.request<ApiAddress[]>('/retail/clients/me/addresses')
        return rows.map(this.toAddress)
    }

    async createAddress(input: SavedAddressInput): Promise<SavedAddress> {
        const row = await this.request<ApiAddress>('/retail/clients/me/addresses', {
            method: 'POST',
            body: JSON.stringify(this.fromAddressInput(input)),
        })
        return this.toAddress(row)
    }

    async updateAddress(id: string, input: Partial<SavedAddressInput>): Promise<SavedAddress> {
        const row = await this.request<ApiAddress>(`/retail/clients/me/addresses/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(this.fromAddressInput(input as SavedAddressInput)),
        })
        return this.toAddress(row)
    }

    async deleteAddress(id: string): Promise<void> {
        await this.request<unknown>(`/retail/clients/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' })
    }

    async setDefaultAddress(id: string): Promise<void> {
        await this.request<unknown>(`/retail/clients/me/addresses/${encodeURIComponent(id)}/default`, { method: 'POST' })
    }

    private imageUrl(src: unknown): string | null {
        const value = typeof src === 'string' ? src.trim() : ''
        if (!value || value.split('?')[0].toLowerCase().endsWith('.svg')) return null
        if (/^https?:\/\//.test(value)) return value
        if (value.startsWith('/') && !value.startsWith('//')) return `${this.webUrl}${value}`
        return null
    }

    private toNotification(row: ApiNotification): Notification {
        return {
            id: row.id,
            title: row.title ?? null,
            message: row.message ?? row.description ?? null,
            target: row.target ?? null,
            location: row.location?.startsWith('/') ? row.location : null,
            isRead: Boolean(row.isRead || row.readed),
            createdAt: row.createdAt ?? row.date ?? null,
        }
    }

    private toAddress(row: ApiAddress): SavedAddress {
        return {
            id: row.id,
            addressType: (row.addressType as SavedAddress['addressType']) ?? 'HOME',
            label: row.label ?? null,
            addressLine: row.addressLine ?? null,
            barangay: row.barangayOrNeighborhood ?? null,
            city: row.cityOrMunicipality ?? null,
            province: row.provinceOrState ?? null,
            postalCode: row.postalCode ?? null,
            country: row.country ?? null,
            formattedAddress: row.formattedAddress ?? null,
            latitude: typeof row.latitude === 'number' ? row.latitude : null,
            longitude: typeof row.longitude === 'number' ? row.longitude : null,
            isDefault: Boolean(row.isDefault),
            additionalInfo: row.additionalInfo ?? null,
        }
    }

    private fromAddressInput(input: SavedAddressInput): Record<string, unknown> {
        return {
            addressType: input.addressType,
            addressLine: input.addressLine,
            barangayOrNeighborhood: input.barangay,
            cityOrMunicipality: input.city,
            provinceOrState: input.province,
            postalCode: input.postalCode,
            country: input.country,
            latitude: input.latitude,
            longitude: input.longitude,
            isDefault: input.isDefault,
            additionalInfo: input.additionalInfo,
        }
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
            status: STATUS_MAP[row.status] ?? 'PENDING_APPROVAL',
            placedAt: row.createdAt,
            updatedAt: row.updatedAt,
            lines,
            subtotal: toNumber(row.subtotal),
            discountAmount: toNumber(row.discountAmount),
            promoCode: row.promoCode,
            shippingAmount: toNumber(row.shippingAmount),
            totalAmount: toNumber(row.totalAmount),
            paymentMethod: row.paymentMethod ?? null,
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
                    ...(this.sessionToken
                        ? { Authorization: `Bearer ${this.sessionToken}` }
                        : {}),
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
                res.status === 401
                    ? 'UNAUTHORIZED'
                    : res.status === 404
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
