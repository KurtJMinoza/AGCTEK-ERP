import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import { loadJson, saveJson, STORAGE_KEYS } from '../api/storage'

type FavoritesContextValue = {
    favorites: Set<string>
    toggleFavorite: (key: string) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

/** Hearted products (product keys), kept on the device like the web shop. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
    const [keys, setKeys] = useState<string[]>([])
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        void loadJson<string[]>(STORAGE_KEYS.favorites)
            .then((stored) => {
                if (Array.isArray(stored)) setKeys(stored.filter((k) => typeof k === 'string'))
            })
            .finally(() => setHydrated(true))
    }, [])

    useEffect(() => {
        if (hydrated) void saveJson(STORAGE_KEYS.favorites, keys)
    }, [keys, hydrated])

    const toggleFavorite = useCallback(
        (key: string) =>
            setKeys((current) =>
                current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
            ),
        [],
    )

    const value = useMemo(
        () => ({ favorites: new Set(keys), toggleFavorite }),
        [keys, toggleFavorite],
    )

    return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
    const ctx = useContext(FavoritesContext)
    if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
    return ctx
}
