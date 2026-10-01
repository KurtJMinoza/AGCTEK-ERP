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
import type { Customer, SignInInput } from '../types'

export type StorefrontSession = {
    customer: Customer
    signedInAt: string
}

type AuthContextValue = {
    session: StorefrontSession | null
    customer: Customer | null
    loading: boolean
    signIn: (input: SignInInput) => Promise<void>
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<StorefrontSession | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        void loadJson<StorefrontSession>(STORAGE_KEYS.session)
            .then((stored) => {
                if (!cancelled && stored?.customer?.id) setSession(stored)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const signIn = useCallback(async (input: SignInInput) => {
        const customer = await commerceApi.signIn(input)
        const next: StorefrontSession = { customer, signedInAt: new Date().toISOString() }
        await saveJson(STORAGE_KEYS.session, next)
        setSession(next)
    }, [])

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
            signOut,
        }),
        [session, loading, signIn, signOut],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
