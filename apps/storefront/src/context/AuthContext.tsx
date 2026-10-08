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
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '../api/storage'
import type { Customer, ProfileUpdate, RegisterInput, SignInInput } from '../types'

export type StorefrontSession = {
    customer: Customer
    signedInAt: string
    /** Bearer token for account and checkout calls; sessions without one must sign in again. */
    sessionToken: string | null
}

type AuthContextValue = {
    session: StorefrontSession | null
    customer: Customer | null
    loading: boolean
    signIn: (input: SignInInput) => Promise<void>
    register: (input: RegisterInput) => Promise<void>
    updateProfile: (update: ProfileUpdate) => Promise<void>
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
            .then((stored) => {
                if (cancelled || !stored?.customer?.customerId) return
                commerceApi.setSessionToken(stored.sessionToken ?? null)
                setSession({ ...stored, sessionToken: stored.sessionToken ?? null })
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const startSession = useCallback(async (customer: Customer) => {
        const next: StorefrontSession = {
            customer,
            signedInAt: new Date().toISOString(),
            sessionToken: commerceApi.getSessionToken(),
        }
        await saveJson(STORAGE_KEYS.session, next)
        setSession(next)
    }, [])

    const signOut = useCallback(async () => {
        commerceApi.setSessionToken(null)
        await removeKey(STORAGE_KEYS.session)
        setSession(null)
    }, [])

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

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            customer: session?.customer ?? null,
            loading,
            signIn,
            register,
            updateProfile,
            signOut,
        }),
        [session, loading, signIn, register, updateProfile, signOut],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
