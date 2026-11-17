import { create } from 'zustand'

export type MarketplaceLoadingOptions = {
    /** When false, only the top progress line shows (used on full-page refresh). */
    overlay?: boolean
}

type MarketplaceLoadingState = {
    /** True while a shop route change, auth action, or boot refresh is in flight. */
    active: boolean
    /** Optional short label under the spinner (e.g. "Signing in"). */
    label: string | null
    /** Full-page centered loader; false = top bar only. */
    overlay: boolean
    /** Monotonic counter so late `stop` calls cannot clear a newer `start`. */
    generation: number
    start: (label?: string, options?: MarketplaceLoadingOptions) => void
    stop: () => void
}

/** Shared loading flag for the marketplace top bar + overlay. */
export const useMarketplaceLoadingStore = create<MarketplaceLoadingState>(
    (set) => ({
        active: false,
        label: null,
        overlay: true,
        generation: 0,
        start: (label, options) =>
            set((state) => ({
                active: true,
                label: label ?? null,
                overlay: options?.overlay ?? true,
                generation: state.generation + 1,
            })),
        stop: () => set({ active: false, label: null }),
    }),
)
