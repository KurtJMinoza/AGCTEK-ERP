import { create } from 'zustand'
import {
    createCustomer,
    getCustomers,
    updateCustomer,
    type CreateCustomerInput,
    type Customer,
    type CustomerStatus,
    type UpdateCustomerInput,
} from '../services/customerMasterService'

export type CustomerFilters = {
    search: string
    status: CustomerStatus | 'ALL'
}

type CustomerState = {
    customers: Customer[]
    filters: CustomerFilters
    loading: boolean
    error: string | null
    lastFetchedAt: number | null
    /** True while a create or update request is in flight. */
    saving: boolean
    /** Uses the cached list unless `force` is set or nothing has loaded yet. */
    fetchCustomers: (options?: { force?: boolean }) => Promise<void>
    /** Merges filters and refetches from the API. */
    setFilters: (filters: Partial<CustomerFilters>) => Promise<void>
    addCustomer: (input: CreateCustomerInput) => Promise<Customer>
    editCustomer: (id: string, input: UpdateCustomerInput) => Promise<Customer>
}

let latestRequest = 0

export const useCustomerStore = create<CustomerState>((set, get) => ({
    customers: [],
    filters: { search: '', status: 'ALL' },
    loading: false,
    error: null,
    lastFetchedAt: null,
    saving: false,
    fetchCustomers: async (options) => {
        const { lastFetchedAt, filters } = get()
        if (lastFetchedAt !== null && !options?.force) return
        const requestId = ++latestRequest
        set({ loading: true, error: null })
        try {
            const customers = await getCustomers({
                search: filters.search,
                status: filters.status === 'ALL' ? undefined : filters.status,
            })
            if (requestId !== latestRequest) return
            set({ customers, lastFetchedAt: Date.now() })
        } catch (error) {
            if (requestId !== latestRequest) return
            set({
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unable to load customers.',
            })
        } finally {
            if (requestId === latestRequest) set({ loading: false })
        }
    },
    setFilters: async (next) => {
        set((state) => ({ filters: { ...state.filters, ...next } }))
        await get().fetchCustomers({ force: true })
    },
    addCustomer: async (input) => {
        set({ saving: true })
        try {
            const created = await createCustomer(input)
            void get().fetchCustomers({ force: true })
            return created
        } finally {
            set({ saving: false })
        }
    },
    editCustomer: async (id, input) => {
        set({ saving: true })
        try {
            const updated = await updateCustomer(id, input)
            set((state) => ({
                customers: state.customers.map((customer) =>
                    customer.id === id ? updated : customer,
                ),
            }))
            void get().fetchCustomers({ force: true })
            return updated
        } finally {
            set({ saving: false })
        }
    },
}))
