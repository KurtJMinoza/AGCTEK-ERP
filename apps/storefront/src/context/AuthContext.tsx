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
import { loadJson, removeKey, saveJson, STORAGE_KEYS } from '../api/storage'
import type { Customer, ProfileUpdate, RegisterInput, SignInInput } from '../types'

export type StorefrontSession = {
    customer: Customer
    signedInAt: string
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
                if (!cancelled && stored?.customer?.customerId) setSession(stored)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const startSession = useCallback(async (customer: Customer) => {
        const next: StorefrontSession = { customer, signedInAt: new Date().toISOString() }
        await saveJson(STORAGE_KEYS.session, next)
        setSession(next)
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
            const customer = await commerceApi.updateProfile(session.customer.customerId, update)
            const next = { ...session, customer }
            await saveJson(STORAGE_KEYS.session, next)
            setSession(next)
        },
        [session],
    )

    const signOut = useCallback(async () => {
        await removeKey(STORAGE_KEYS.session)
        setSession(null)
    }, [])

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
