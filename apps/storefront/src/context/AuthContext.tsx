import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { commerceApi } from '../api/client'
import { CommerceApiError } from '../api/commerceApi'
import { logoutShopSession, type ShopAuthSession } from '../api/shopAuthApi'
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '../api/storage'
import type { Customer, ProfileUpdate, RegisterInput, SignInInput } from '../types'

export type StorefrontSession = {
    customer: Customer
    signedInAt: string
    /** Bearer token for account and checkout calls; sessions without one must sign in again. */
    sessionToken: string | null
    /** Shop auth sessions carry an expiry; legacy password sessions predate it. */
    expiresAt: string | null
}

type AuthContextValue = {
    session: StorefrontSession | null
    customer: Customer | null
    loading: boolean
    signIn: (input: SignInInput) => Promise<void>
    register: (input: RegisterInput) => Promise<void>
    /** Persists a Gmail OTP or Google session from `/shop/auth/*`. */
    applyShopSession: (shopSession: ShopAuthSession) => Promise<void>
    updateProfile: (update: ProfileUpdate) => Promise<void>
    /** Reload profile from API (after map pin / default address sync). */
    refreshCustomer: () => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Marketplace account session (same retail-client accounts as the web shop). */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<StorefrontSession | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        void loadJson<StorefrontSession>(STORAGE_KEYS.session)
            .then(async (stored) => {
                if (!stored?.customer?.customerId) return
                if (
                    stored.expiresAt &&
                    Date.parse(stored.expiresAt) <= Date.now()
                ) {
                    await removeKey(STORAGE_KEYS.session)
                    return
                }
                if (cancelled) return
                const token = stored.sessionToken ?? null
                commerceApi.setSessionToken(token)
                setSession({
                    ...stored,
                    sessionToken: token,
                    expiresAt: stored.expiresAt ?? null,
                })
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const startSession = useCallback(
        async (customer: Customer, expiresAt: string | null = null) => {
            const next: StorefrontSession = {
                customer,
                signedInAt: new Date().toISOString(),
                sessionToken: commerceApi.getSessionToken(),
                expiresAt,
            }
            await saveJson(STORAGE_KEYS.session, next)
            setSession(next)
        },
        [],
    )

    const applyShopSession = useCallback(async (shopSession: ShopAuthSession) => {
        commerceApi.setSessionToken(shopSession.token)
        await startSession(shopSession.client, shopSession.expiresAt)
    }, [startSession])

    const signOut = useCallback(async () => {
        const token = session?.sessionToken
        if (token) void logoutShopSession(token)
        commerceApi.setSessionToken(null)
        await removeKey(STORAGE_KEYS.session)
        setSession(null)
    }, [session])

    const signIn = useCallback(
        async (input: SignInInput) => startSession(await commerceApi.signIn(input)),
        [startSession],
    )

    const register = useCallback(
        async (input: RegisterInput) => startSession(await commerceApi.register(input)),
        [startSession],
    )

    const updateProfile = useCallback(
        async (update: ProfileUpdate) => {
            if (!session) return
            try {
                const customer = await commerceApi.updateProfile(
                    session.customer.customerId,
                    update,
                )
                const next = { ...session, customer }
                await saveJson(STORAGE_KEYS.session, next)
                setSession(next)
            } catch (error) {
                if (error instanceof CommerceApiError && error.code === 'UNAUTHORIZED') {
                    await signOut()
                }
                throw error
            }
        },
        [session, signOut],
    )

    const refreshCustomer = useCallback(async () => {
        if (!session) return
        try {
            const customer = await commerceApi.getCurrentCustomer()
            const next = { ...session, customer }
            await saveJson(STORAGE_KEYS.session, next)
            setSession(next)
        } catch (error) {
            if (error instanceof CommerceApiError && error.code === 'UNAUTHORIZED') {
                await signOut()
            }
            throw error
        }
    }, [session, signOut])

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            customer: session?.customer ?? null,
            loading,
            signIn,
            register,
            applyShopSession,
            updateProfile,
            refreshCustomer,
            signOut,
        }),
        [session, loading, signIn, register, applyShopSession, updateProfile, refreshCustomer, signOut],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
