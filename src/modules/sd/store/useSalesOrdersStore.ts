import { create } from 'zustand'
import {
    confirmSalesOrder,
    getSalesOrders,
    updateRetailSalesOrderStatus,
    SALES_ORDER_RECORDED_EVENT,
    type RetailStatusTarget,
    type SalesOrderDateRange,
    type SalesOrderRecord,
} from '../services/salesOrderDashboardService'

type SalesOrderFilters = {
    search: string
    dateRange: SalesOrderDateRange
    /** Branch code, or `'all'` for every branch. */
    branchId: string
    /** Organization / MM company id, or `'all'` for every company. */
    companyId: string
}

type SalesOrdersState = {
    orders: SalesOrderRecord[]
    filters: SalesOrderFilters
    loading: boolean
    error: string | null
    lastFetchedAt: number | null
    /** Id of the order whose status is being changed, for button spinners. */
    updatingId: string | null
    /** Uses the cached list unless `force` is set or nothing has loaded yet. */
    fetchOrders: (options?: { force?: boolean }) => Promise<void>
    /** Merges filters and refetches from the API. */
    setFilters: (filters: Partial<SalesOrderFilters>) => Promise<void>
    /** PATCHes the status, patches the cached row, then refetches. */
    updateOrderStatus: (
        id: string,
        status: RetailStatusTarget,
    ) => Promise<SalesOrderRecord>
    /** Confirms a DRAFT order (SD→MM handoff), patches the cached row, then refetches. */
    confirmOrder: (id: string) => Promise<SalesOrderRecord>
}

let latestRequest = 0

export const useSalesOrdersStore = create<SalesOrdersState>((set, get) => ({
    orders: [],
    filters: { search: '', dateRange: 'all', branchId: 'all', companyId: 'all' },
    loading: false,
    error: null,
    lastFetchedAt: null,
    updatingId: null,
    fetchOrders: async (options) => {
        const { lastFetchedAt, filters } = get()
        if (lastFetchedAt !== null && !options?.force) return
        const requestId = ++latestRequest
        set({ loading: true, error: null })
        try {
            const orders = await getSalesOrders(filters)
            if (requestId !== latestRequest) return
            set({ orders, lastFetchedAt: Date.now() })
        } catch (error) {
            if (requestId !== latestRequest) return
            set({
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unable to load sales orders.',
            })
        } finally {
            if (requestId === latestRequest) set({ loading: false })
        }
    },
    setFilters: async (next) => {
        set((state) => ({ filters: { ...state.filters, ...next } }))
        await get().fetchOrders({ force: true })
    },
    updateOrderStatus: async (id, status) => {
        set({ updatingId: id })
        try {
            const updated = await updateRetailSalesOrderStatus(id, status)
            set((state) => ({
                orders: state.orders.map((order) =>
                    order.id === id ? updated : order,
                ),
            }))
            void get().fetchOrders({ force: true })
            return updated
        } finally {
            set({ updatingId: null })
        }
    },
    confirmOrder: async (id) => {
        set({ updatingId: id })
        try {
            const updated = await confirmSalesOrder(id)
            set((state) => ({
                orders: state.orders.map((order) =>
                    order.id === id ? updated : order,
                ),
            }))
            void get().fetchOrders({ force: true })
            return updated
        } finally {
            set({ updatingId: null })
        }
    },
}))

if (typeof window !== 'undefined') {
    window.addEventListener(SALES_ORDER_RECORDED_EVENT, () =>
        useSalesOrdersStore.setState({ lastFetchedAt: null }),
    )

    // Cross-tab: an order placed/cancelled in another tab (storefront, POS)
    // invalidates the cache immediately and refetches now — no 30s wait.
    if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('agc-erp')
        channel.onmessage = (event: MessageEvent) => {
            const message = event.data as { type?: string } | null
            if (message?.type === 'sales-order-recorded') {
                useSalesOrdersStore.setState({ lastFetchedAt: null })
                void useSalesOrdersStore.getState().fetchOrders({ force: true })
            }
        }
    }

    // Refetch as soon as the user returns to the tab (no stale view).
    window.addEventListener('focus', () => {
        useSalesOrdersStore.setState({ lastFetchedAt: null })
        void useSalesOrdersStore.getState().fetchOrders({ force: true })
    })
}
