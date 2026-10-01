import {
    CommerceApiError,
    type CommerceApi,
    type CreateOrderInput,
    type Customer,
    type Order,
    type OrderStatus,
    type OrderTracking,
    type Product,
    type ProductQuery,
    type SignInInput,
    type TrackingEvent,
} from './commerceApi'

const LATENCY_MS = 250

/** Orders placed in the mock advance one milestone per step so tracking can be QA'd. */
const SIM_STEP_MS = 60_000
const SIM_FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']
const SIM_AREAS: Partial<Record<OrderStatus, string>> = {
    PACKED: 'Luzon Hub',
    OUT_FOR_DELIVERY: 'Cainta, Rizal',
    DELIVERED: 'Antipolo City',
}

const DEMO_ADDRESS = 'Brgy. San Isidro, Antipolo City, Rizal'

const STATUS_LABELS: Record<OrderStatus, string> = {
    PLACED: 'Order placed',
    CONFIRMED: 'Order confirmed',
    PACKED: 'Packed and ready to ship',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Order cancelled',
}

const PRODUCTS: Product[] = [
    {
        id: 'p-cement-40',
        sku: 'CEM-PORT-40KG',
        name: 'Portland Cement 40kg',
        description: 'General-purpose Type 1 Portland cement for masonry, plastering and concrete works.',
        category: 'Cement',
        unitPrice: 265,
        currency: 'PHP',
        uom: 'bag',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-rebar-10',
        sku: 'RBR-10MM-6M',
        name: 'Deformed Rebar 10mm × 6m',
        description: 'Grade 40 deformed steel reinforcing bar for slabs, columns and footings.',
        category: 'Steel',
        unitPrice: 185,
        currency: 'PHP',
        uom: 'pc',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-rebar-12',
        sku: 'RBR-12MM-6M',
        name: 'Deformed Rebar 12mm × 6m',
        description: 'Grade 40 deformed steel reinforcing bar for heavier structural members.',
        category: 'Steel',
        unitPrice: 265,
        currency: 'PHP',
        uom: 'pc',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-pvc-2in',
        sku: 'PVC-S1000-2IN',
        name: 'PVC Pipe 2" Series 1000',
        description: 'Sanitary PVC pipe, 3m length, for drainage and waste lines.',
        category: 'Plumbing',
        unitPrice: 320,
        currency: 'PHP',
        uom: 'length',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-tile-60',
        sku: 'TIL-CER-60X60',
        name: 'Ceramic Floor Tile 60×60',
        description: 'Matte-finish ceramic floor tile, 4 pcs per carton (1.44 sqm).',
        category: 'Finishing',
        unitPrice: 540,
        currency: 'PHP',
        uom: 'carton',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-gi-roof',
        sku: 'GI-RIB-8FT',
        name: 'GI Rib-Type Roofing 8ft',
        description: 'Pre-painted galvanized iron roofing sheet, gauge 26.',
        category: 'Roofing',
        unitPrice: 410,
        currency: 'PHP',
        uom: 'sheet',
        imageUrl: null,
        available: false,
    },
    {
        id: 'p-lumber-2x4',
        sku: 'LUM-KD-2X4-10',
        name: 'Kiln-Dried Lumber 2×4×10',
        description: 'Kiln-dried coco lumber for framing and formworks.',
        category: 'Lumber',
        unitPrice: 230,
        currency: 'PHP',
        uom: 'pc',
        imageUrl: null,
        available: true,
    },
    {
        id: 'p-hollow-4',
        sku: 'CHB-4IN',
        name: 'Concrete Hollow Block 4"',
        description: 'Load-bearing concrete hollow block for partition and perimeter walls.',
        category: 'Masonry',
        unitPrice: 16,
        currency: 'PHP',
        uom: 'pc',
        imageUrl: null,
        available: true,
    },
]

type MockOrderRecord = {
    order: Order
    events: TrackingEvent[]
    eta: string | null
    simulatedFrom?: number
}

function delay<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function hoursFromNow(hours: number): string {
    return new Date(Date.now() + hours * 3_600_000).toISOString()
}

function event(
    status: OrderStatus,
    occurredAt: string,
    area: string | null = null,
): TrackingEvent {
    return { status, label: STATUS_LABELS[status], occurredAt, area }
}

function buildLines(items: CreateOrderInput['items']) {
    return items.map((item) => {
        const product = PRODUCTS.find((p) => p.id === item.productId)
        if (!product) {
            throw new CommerceApiError(`Product ${item.productId} not found`, 'NOT_FOUND')
        }
        return {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            uom: product.uom,
            quantity: item.quantity,
            unitPrice: product.unitPrice,
            lineTotal: product.unitPrice * item.quantity,
        }
    })
}

function seedOrders(): MockOrderRecord[] {
    const delivered = buildLines([
        { productId: 'p-cement-40', quantity: 20 },
        { productId: 'p-hollow-4', quantity: 200 },
    ])
    const inTransit = buildLines([
        { productId: 'p-rebar-10', quantity: 30 },
        { productId: 'p-pvc-2in', quantity: 6 },
    ])
    const sum = (lines: Order['lines']) =>
        lines.reduce((total, line) => total + line.lineTotal, 0)

    return [
        {
            order: {
                id: 'o-1002',
                orderNumber: 'SO-WEB-1002',
                status: 'OUT_FOR_DELIVERY',
                placedAt: hoursAgo(26),
                lines: inTransit,
                subtotal: sum(inTransit),
                currency: 'PHP',
                shippingAddress: DEMO_ADDRESS,
                notes: null,
            },
            events: [
                event('PLACED', hoursAgo(26)),
                event('CONFIRMED', hoursAgo(24)),
                event('PACKED', hoursAgo(6), 'Luzon Hub'),
                event('OUT_FOR_DELIVERY', hoursAgo(2), 'Cainta, Rizal'),
            ],
            eta: hoursFromNow(3),
        },
        {
            order: {
                id: 'o-1001',
                orderNumber: 'SO-WEB-1001',
                status: 'DELIVERED',
                placedAt: hoursAgo(120),
                lines: delivered,
                subtotal: sum(delivered),
                currency: 'PHP',
                shippingAddress: DEMO_ADDRESS,
                notes: 'Leave at site gate',
            },
            events: [
                event('PLACED', hoursAgo(120)),
                event('CONFIRMED', hoursAgo(118)),
                event('PACKED', hoursAgo(100), 'Luzon Hub'),
                event('OUT_FOR_DELIVERY', hoursAgo(98), 'Marikina City'),
                event('DELIVERED', hoursAgo(95), 'Antipolo City'),
            ],
            eta: null,
        },
    ]
}

/**
 * In-memory stand-in for the ERP. Totals and timelines here simulate what the
 * backend will return; the UI must still treat them as server-provided values.
 */
export class MockCommerceApi implements CommerceApi {
    private records: MockOrderRecord[] = seedOrders()
    private sequence = 1003

    async signIn(input: SignInInput): Promise<Customer> {
        const email = input.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new CommerceApiError('Enter a valid email address', 'VALIDATION')
        }
        if (!input.password) {
            throw new CommerceApiError('Enter your password', 'VALIDATION')
        }
        const local = email.split('@')[0]
        return delay({
            id: `c-${local}`,
            name: local.charAt(0).toUpperCase() + local.slice(1),
            email,
            defaultAddress: DEMO_ADDRESS,
        })
    }

    async getProducts(query?: ProductQuery): Promise<Product[]> {
        const search = query?.search?.trim().toLowerCase()
        const result = PRODUCTS.filter((p) => {
            if (query?.category && p.category !== query.category) return false
            if (!search) return true
            return (
                p.name.toLowerCase().includes(search) ||
                p.sku.toLowerCase().includes(search) ||
                p.category.toLowerCase().includes(search)
            )
        })
        return delay(clone(result))
    }

    async getProduct(id: string): Promise<Product> {
        const product = PRODUCTS.find((p) => p.id === id)
        if (!product) throw new CommerceApiError('Product not found', 'NOT_FOUND')
        return delay(clone(product))
    }

    async createOrder(input: CreateOrderInput): Promise<Order> {
        if (input.items.length === 0) {
            throw new CommerceApiError('Cart is empty', 'VALIDATION')
        }
        if (input.items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) {
            throw new CommerceApiError('Quantities must be positive whole numbers', 'VALIDATION')
        }
        const unavailable = input.items
            .map((i) => PRODUCTS.find((p) => p.id === i.productId))
            .find((p) => p && !p.available)
        if (unavailable) {
            throw new CommerceApiError(`${unavailable.name} is currently unavailable`, 'VALIDATION')
        }

        const lines = buildLines(input.items)
        const seq = this.sequence++
        const now = Date.now()
        const placedAt = new Date(now).toISOString()
        const order: Order = {
            id: `o-${seq}`,
            orderNumber: `SO-WEB-${seq}`,
            status: 'PLACED',
            placedAt,
            lines,
            subtotal: lines.reduce((total, line) => total + line.lineTotal, 0),
            currency: 'PHP',
            shippingAddress: input.shippingAddress ?? null,
            notes: input.notes ?? null,
        }
        this.records.unshift({
            order,
            events: [event('PLACED', placedAt)],
            eta: new Date(now + (SIM_FLOW.length - 1) * SIM_STEP_MS).toISOString(),
            simulatedFrom: now,
        })
        return delay(clone(order))
    }

    async getOrders(): Promise<Order[]> {
        this.records.forEach((r) => this.advance(r))
        return delay(clone(this.records.map((r) => r.order)))
    }

    async getOrder(id: string): Promise<Order> {
        return delay(clone(this.findRecord(id).order))
    }

    async getTracking(orderId: string): Promise<OrderTracking> {
        const record = this.findRecord(orderId)
        const lastWithArea = [...record.events].reverse().find((e) => e.area)
        return delay(
            clone({
                orderId: record.order.id,
                orderNumber: record.order.orderNumber,
                status: record.order.status,
                events: record.events,
                eta: record.eta,
                lastKnownArea: lastWithArea?.area ?? null,
            }),
        )
    }

    private findRecord(id: string): MockOrderRecord {
        const record = this.records.find((r) => r.order.id === id)
        if (!record) throw new CommerceApiError('Order not found', 'NOT_FOUND')
        this.advance(record)
        return record
    }

    private advance(record: MockOrderRecord): void {
        const start = record.simulatedFrom
        if (start === undefined || record.order.status === 'CANCELLED') return
        const target = Math.min(
            SIM_FLOW.length - 1,
            Math.floor((Date.now() - start) / SIM_STEP_MS),
        )
        let index = SIM_FLOW.indexOf(record.order.status)
        while (index < target) {
            index++
            const status = SIM_FLOW[index]
            record.events.push(
                event(status, new Date(start + index * SIM_STEP_MS).toISOString(), SIM_AREAS[status] ?? null),
            )
            record.order.status = status
        }
        if (record.order.status === 'DELIVERED') record.eta = null
    }
}
