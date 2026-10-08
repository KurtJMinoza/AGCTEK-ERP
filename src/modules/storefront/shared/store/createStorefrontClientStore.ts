import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
    RetailSessionExpiredError,
    fetchRetailClientProfile,
    loginRetailClient,
    registerRetailClient,
    updateRetailClientProfile,
    type RetailClientProfile,
    type RetailClientSession,
    type RetailLoginPayload,
    type RetailProfileUpdate,
    type RetailRegisterPayload,
} from '@/services/storefront/retailClientService'

type PersistedSession = {
    client: RetailClientProfile | null
    token: string | null
    expiresAt: string | null
}

export type StorefrontClientState = PersistedSession & {
    /** Profile dialog for a signed-in shopper. */
    isAccountOpen: boolean
    isBusy: boolean
    openAccount: () => void
    closeAccount: () => void
    register: (payload: RetailRegisterPayload) => Promise<void>
    login: (payload: RetailLoginPayload) => Promise<void>
    updateProfile: (
        profile: RetailProfileUpdate,
    ) => Promise<void>
    /** Refreshes checkout details after a saved address changes the default location. */
    refreshProfile: () => Promise<void>
    logout: () => void
}

const SIGNED_OUT: PersistedSession = {
    client: null,
    token: null,
    expiresAt: null,
}

const isLive = (session: Partial<PersistedSession> | undefined) =>
    Boolean(
        session?.client &&
            session.token &&
            session.expiresAt &&
            Date.parse(session.expiresAt) > Date.now(),
    )

const fromApi = (session: RetailClientSession): PersistedSession => ({
    client: session.client,
    token: session.token,
    expiresAt: session.expiresAt,
})

/**
 * Storefront client session over the shared client-account API. Each
 * storefront passes its own `storageKey` so sign-in state never leaks
 * between tenants on the same browser. Sessions without a valid, unexpired
 * token are discarded on load.
 */
export const createStorefrontClientStore = (storageKey: string) =>
    create<StorefrontClientState>()(
        persist(
            (set, get) => ({
                ...SIGNED_OUT,
                isAccountOpen: false,
                isBusy: false,
                openAccount: () => set({ isAccountOpen: true }),
                closeAccount: () => set({ isAccountOpen: false }),
                register: async (payload) => {
                    set({ isBusy: true })
                    try {
                        set(fromApi(await registerRetailClient(payload)))
                    } finally {
                        set({ isBusy: false })
                    }
                },
                login: async (payload) => {
                    set({ isBusy: true })
                    try {
                        set(fromApi(await loginRetailClient(payload)))
                    } finally {
                        set({ isBusy: false })
                    }
                },
                updateProfile: async (profile) => {
                    const { token } = get()
                    if (!isLive(get()) || !token) {
                        get().logout()
                        throw new RetailSessionExpiredError()
                    }
                    set({ isBusy: true })
                    try {
                        const client = await updateRetailClientProfile(
                            token,
                            profile,
                        )
                        set({ client, isAccountOpen: false })
                    } catch (error) {
                        if (error instanceof RetailSessionExpiredError) {
                            get().logout()
                        }
                        throw error
                    } finally {
                        set({ isBusy: false })
                    }
                },
                refreshProfile: async () => {
                    const { token } = get()
                    if (!isLive(get()) || !token) {
                        get().logout()
                        throw new RetailSessionExpiredError()
                    }
                    const client = await fetchRetailClientProfile(token)
                    set({ client })
                },
                logout: () => set({ ...SIGNED_OUT, isAccountOpen: false }),
            }),
            {
                name: storageKey,
                partialize: (state): PersistedSession => ({
                    client: state.client,
                    token: state.token,
                    expiresAt: state.expiresAt,
                }),
                merge: (persisted, current) => ({
                    ...current,
                    ...(isLive(persisted as PersistedSession)
                        ? (persisted as PersistedSession)
                        : SIGNED_OUT),
                }),
            },
        ),
    )
