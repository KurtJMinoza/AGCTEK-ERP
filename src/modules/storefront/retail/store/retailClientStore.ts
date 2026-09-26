import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RetailClientProfile } from '@/services/storefront/retailClientService'
import {
    loginRetailClient,
    registerRetailClient,
    updateRetailClientProfile,
    type RetailLoginPayload,
    type RetailRegisterPayload,
} from '@/services/storefront/retailClientService'
import type { SalesOrderShippingDetails } from '@/types/storefront/retail'

type RetailClientState = {
    client: RetailClientProfile | null
    isLoginOpen: boolean
    isBusy: boolean
    openLogin: () => void
    closeLogin: () => void
    register: (payload: RetailRegisterPayload) => Promise<void>
    login: (payload: RetailLoginPayload) => Promise<void>
    updateProfile: (
        profile: Partial<SalesOrderShippingDetails>,
    ) => Promise<void>
    logout: () => void
}

export const useRetailClientStore = create<RetailClientState>()(
    persist(
        (set, get) => ({
            client: null,
            isLoginOpen: false,
            isBusy: false,
            openLogin: () => set({ isLoginOpen: true }),
            closeLogin: () => set({ isLoginOpen: false }),
            register: async (payload) => {
                set({ isBusy: true })
                try {
                    const client = await registerRetailClient(payload)
                    set({ client, isLoginOpen: false })
                } finally {
                    set({ isBusy: false })
                }
            },
            login: async (payload) => {
                set({ isBusy: true })
                try {
                    const client = await loginRetailClient(payload)
                    set({ client, isLoginOpen: false })
                } finally {
                    set({ isBusy: false })
                }
            },
            updateProfile: async (profile) => {
                const current = get().client
                if (!current) return
                set({ isBusy: true })
                try {
                    const client = await updateRetailClientProfile(
                        current.customerId,
                        profile,
                    )
                    set({ client, isLoginOpen: false })
                } finally {
                    set({ isBusy: false })
                }
            },
            logout: () => {
                set({ client: null, isLoginOpen: false })
            },
        }),
        {
            name: 'aw-retail-client',
            partialize: (state) => ({ client: state.client }),
        },
    ),
)
