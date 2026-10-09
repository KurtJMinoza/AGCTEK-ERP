import type {
    Availability,
    CheckoutInput,
    CheckoutResult,
    Customer,
    Order,
    Product,
    ProfileUpdate,
    RegisterInput,
    SignInInput,
} from '../types'
import { CommerceApiError, type CommerceApi } from './commerceApi'

/** Offline demo data (EXPO_PUBLIC_USE_MOCK_API=true); resets on reload. */
const LATENCY_MS = 250
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const delay = <T>(value: T): Promise<T> =>
    new Promise((resolve) =>
        setTimeout(() => resolve(JSON.parse(JSON.stringify(value)) as T), LATENCY_MS),
    )

const product = (
    p: Pick<Product, 'id' | 'divisionId' | 'sku' | 'name' | 'category' | 'price'> &
        Partial<Product>,
): Product => ({
    description: '',
    originalPrice: null,
    badge: null,
    images: [],
    tagline: null,
    details: null,
    features: [],
    inclusions: [],
    specs: [
        { label: 'Category', value: p.category },
        { label: 'SKU', value: p.sku },
    ],
    reviews: [],
    warranty: null,
    isAddon: false,
    ...p,
})

const PRODUCTS: Product[] = [
    product({
        id: 'm-vit-multi',
        divisionId: 'DIV_RETAIL',
        sku: 'VIT-MULTI-60',
        name: 'Daily Essentials Multivitamin',
        category: 'Vitamins',
        price: 24.99,
        description: 'Balanced daily support with vitamins A, C, D, E, and minerals.',
        features: ['60 vegetarian capsules · 2-month supply', 'Third-party purity tested'],
        reviews: [{ id: 'r1', rating: 5, title: 'Great value', author: 'Ana' }],
    }),
    product({
        id: 'm-bag-tote',
        divisionId: 'DIV_RETAIL',
        sku: 'BAG-TOTE-OLV',
        name: 'Market Tote — Olive',
        category: 'Bags',
        price: 45,
        originalPrice: 55,
        badge: 'Best Seller',
    }),
    product({
        id: 'm-lpg-11',
        divisionId: 'DIV_LPG',
        sku: 'LPG-REFILL-11KG',
        name: '11kg LPG Refill',
        category: 'Refill',
        price: 1186,
    }),
    product({
        id: 'm-lpg-hose',
        divisionId: 'DIV_LPG',
        sku: 'LPG-HOSE-SET',
        name: 'Hose, Regulator, and Clamp Bundle',
        category: 'Add-on',
        price: 300,
        isAddon: true,
    }),
    product({
        id: 'm-mcp-fridge',
        divisionId: 'DIV_APPLIANCES',
        sku: 'MCP-REF-2DOOR-8CUFT',
        name: '8.0 cu.ft. Two-Door Refrigerator',
        category: 'Cooling',
        price: 16200,
        originalPrice: 18000,
        badge: 'Best Seller',
        warranty: '5 years on compressor',
    }),
    product({
        id: 'm-mcp-wash',
        divisionId: 'DIV_APPLIANCES',
        sku: 'MCP-WM-FL-7KG',
        name: '7kg Front Load Washing Machine',
        category: 'Laundry',
        price: 22000,
        originalPrice: 25000,
    }),
]

export class MockCommerceApi implements CommerceApi {
    private orders: (Order & { customerId: string })[] = []
    private nextNumber = 1001
    private profiles = new Map<string, Customer>()

    getProducts(): Promise<Product[]> {
        return delay(PRODUCTS)
    }

    getAvailability(_divisionId: string, sku: string): Promise<Availability> {
        const available = sku.includes('WM') ? 4 : 45
        return delay({ state: available < 10 ? 'LOW_STOCK' : 'IN_STOCK', availableQuantity: available })
    }

    signIn({ email, password }: SignInInput): Promise<Customer> {
        if (!EMAIL.test(email.trim()) || !password) {
            return Promise.reject(new CommerceApiError('Invalid email or password.', 'VALIDATION'))
        }
        const key = email.trim().toLowerCase()
        const existing = this.profiles.get(key)
        if (existing) return delay(existing)
        const local = key.split('@')[0] ?? 'Shopper'
        const customer: Customer = {
            customerId: `c-${local}`,
            email: key,
            fullName: local.charAt(0).toUpperCase() + local.slice(1),
            phone: '09171234567',
            addressLine1: '123 Rizal Street',
            city: 'Davao City',
            region: 'Davao del Sur',
            postalCode: '8000',
            country: 'PH',
        }
        this.profiles.set(key, customer)
        return delay(customer)
    }

    register({ password: _password, ...details }: RegisterInput): Promise<Customer> {
        const key = details.email.trim().toLowerCase()
        if (this.profiles.has(key)) {
            return Promise.reject(new CommerceApiError('An account with this email already exists.', 'CONFLICT'))
        }
        const customer = { ...details, email: key, customerId: `c-${key.split('@')[0]}` }
        this.profiles.set(key, customer)
        return delay(customer)
    }

    updateProfile(customerId: string, update: ProfileUpdate): Promise<Customer> {
        const entry = [...this.profiles.values()].find((c) => c.customerId === customerId)
        if (!entry) return Promise.reject(new CommerceApiError('Account not found.', 'NOT_FOUND'))
        const next = { ...entry, ...update }
        this.profiles.set(next.email, next)
        return delay(next)
    }

    checkout({ checkoutId, customerId, shipping, pricing }: CheckoutInput): Promise<CheckoutResult> {
        const now = new Date().toISOString()
        const order = {
            customerId,
            id: `o-${this.nextNumber}`,
            orderNumber: `SO-${String(this.nextNumber++).padStart(6, '0')}`,
            divisionIds: pricing.stores.map((store) => store.divisionId),
            status: 'PREPARING_TO_SHIP' as const,
            placedAt: now,
            updatedAt: now,
            lines: pricing.stores.flatMap((store) =>
                store.lines.map((line) => ({ ...line, divisionId: store.divisionId })),
            ),
            subtotal: pricing.subtotal,
            discountAmount: pricing.discountAmount,
            promoCode: pricing.promoCode,
            shippingAmount: pricing.shipping,
            totalAmount: pricing.grandTotal,
            shipTo: {
                fullName: shipping.fullName,
                phone: shipping.phone,
                address: [shipping.addressLine1, shipping.city, shipping.region, shipping.postalCode].join(', '),
            },
        }
        this.orders.unshift(order)
        return delay({
            checkoutId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            grandTotal: order.totalAmount,
            stores: pricing.stores,
        })
    }

    getOrders(customerId: string): Promise<Order[]> {
        return delay(
            this.orders
                .filter((o) => o.customerId === customerId)
                .map(({ customerId: _c, ...order }) => order),
        )
    }

    cancelOrder(orderId: string): Promise<void> {
        const order = this.orders.find((o) => o.id === orderId)
        if (order) order.status = 'CANCELLED'
        return delay(undefined)
    }
}
