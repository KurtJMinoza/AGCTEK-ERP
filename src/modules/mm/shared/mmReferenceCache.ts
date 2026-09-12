/**
 * In-memory TTL cache for MM reference data (companies, plants, warehouses, …).
 * Prevents every module page from re-hitting the same org endpoints on navigation.
 */

type CacheEntry<T> = {
    expiresAt: number
    promise: Promise<T>
}

const store = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL_MS = 5 * 60 * 1000

export function mmCachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
    const now = Date.now()
    const hit = store.get(key) as CacheEntry<T> | undefined
    if (hit && hit.expiresAt > now) {
        return hit.promise
    }
    const promise = fetcher().catch((err) => {
        store.delete(key)
        throw err
    })
    store.set(key, { expiresAt: now + ttlMs, promise })
    return promise
}

export function mmInvalidateCache(prefix?: string) {
    if (!prefix) {
        store.clear()
        return
    }
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
    }
}
