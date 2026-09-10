import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { apiGetDriverMe, apiSignIn } from '../api/client'
import { clearSession, loadSession, saveSession } from '../api/storage'
import type { Driver, Session, AuthUser } from '../types'

type AuthContextValue = {
    session: Session | null
    loading: boolean
    error: string | null
    signIn: (userName: string, password: string) => Promise<void>
    signOut: () => Promise<void>
    refreshDriver: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        void (async () => {
            try {
                const stored = await loadSession()
                setSession(stored)
            } catch (err) {
                console.warn('Failed to restore session', err)
                setSession(null)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    const signIn = useCallback(async (userName: string, password: string) => {
        setError(null)
        const user: AuthUser = await apiSignIn(userName.trim(), password)
        const driver: Driver = await apiGetDriverMe(user.id)
        const next: Session = { user, driver }
        await saveSession(next)
        setSession(next)
    }, [])

    const signOut = useCallback(async () => {
        await clearSession()
        setSession(null)
    }, [])

    const refreshDriver = useCallback(async () => {
        if (!session?.user.id) return
        const driver = await apiGetDriverMe(session.user.id)
        const next = { ...session, driver }
        await saveSession(next)
        setSession(next)
    }, [session])

    const value = useMemo(
        () => ({ session, loading, error, signIn, signOut, refreshDriver }),
        [session, loading, error, signIn, signOut, refreshDriver],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
