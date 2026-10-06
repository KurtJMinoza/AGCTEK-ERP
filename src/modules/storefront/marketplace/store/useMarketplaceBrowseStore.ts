import { create } from 'zustand'

type ReturnScroll = {
    /** Page (path + query) the shopper left to open a product. */
    url: string
    top: number
}

type MarketplaceBrowseState = {
    /** Header search box text, shared by every /shop page. */
    search: string
    returnScroll: ReturnScroll | null
    setSearch: (search: string) => void
    setReturnScroll: (returnScroll: ReturnScroll | null) => void
    reset: () => void
}

/**
 * In-memory marketplace browsing state (not persisted): the search box and
 * the scroll position to restore when the shopper comes back from a product.
 */
export const useMarketplaceBrowseStore = create<MarketplaceBrowseState>()(
    (set) => ({
        search: '',
        returnScroll: null,
        setSearch: (search) => set({ search }),
        setReturnScroll: (returnScroll) => set({ returnScroll }),
        reset: () => set({ search: '', returnScroll: null }),
    }),
)

const currentUrl = () => `${window.location.pathname}${window.location.search}`

/** Remember where the shopper is before opening a product page. */
export const rememberReturnScroll = () =>
    useMarketplaceBrowseStore
        .getState()
        .setReturnScroll({ url: currentUrl(), top: window.scrollY })

/** Scroll position saved for this exact page, consumed once. */
export const takeReturnScroll = () => {
    const { returnScroll, setReturnScroll } =
        useMarketplaceBrowseStore.getState()
    if (!returnScroll || returnScroll.url !== currentUrl()) return null
    setReturnScroll(null)
    return returnScroll.top
}
