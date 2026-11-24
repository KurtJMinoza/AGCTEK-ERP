import MarketplaceLoadingPanel from '@/modules/storefront/marketplace/components/MarketplaceLoadingPanel'

/** Suspense fallback while a /shop route segment loads — same panel as the overlay. */
export default function ShopLoading() {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex min-h-screen w-full items-center justify-center bg-gray-50"
        >
            <MarketplaceLoadingPanel />
            <div
                aria-hidden
                className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[2px] origin-left bg-shop-600"
                style={{
                    transform: 'scaleX(0.55)',
                    boxShadow: '0 0 8px rgba(5, 150, 105, 0.4)',
                }}
            />
        </div>
    )
}
