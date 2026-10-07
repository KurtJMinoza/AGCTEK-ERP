import AsyncStorage from '@react-native-async-storage/async-storage'

/** Storefront-only keys. Must never overlap `agctek.driver.*`. */
export const STORAGE_KEYS = {
    cart: 'agctek.storefront.cart',
    session: 'agctek.storefront.session',
    favorites: 'agctek.storefront.favorites',
} as const

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export async function loadJson<T>(key: StorageKey): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export async function saveJson(key: StorageKey, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value))
}

export async function removeKey(key: StorageKey): Promise<void> {
    await AsyncStorage.removeItem(key)
}
