import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type MarketplaceFavoritesState = {
    /** `productKey`s the shopper hearted. */
    keys: string[]
    toggle: (key: string) => void
}

/** Shopper's hearted products, kept on this device only. */
export const useMarketplaceFavoritesStore = create<MarketplaceFavoritesState>()(
    persist(
        (set) => ({
            keys: [],
            toggle: (key) =>
                set((state) => ({
                    keys: state.keys.includes(key)
                        ? state.keys.filter((k) => k !== key)
                        : [...state.keys, key],
                })),
        }),
        {
            name: 'marketplace-favorites',
            storage: createJSONStorage(() => localStorage),
        },
    ),
)
