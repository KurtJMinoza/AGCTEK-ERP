import { Suspense, type ReactNode } from 'react'
import MarketplaceProvider from '@/modules/storefront/marketplace/MarketplaceProvider'
import MarketplaceLoadingPanel from '@/modules/storefront/marketplace/components/MarketplaceLoadingPanel'

/** Marketplace shell: the storefront's own light canvas, independent of the ERP theme. */
export default function ShopLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-500 antialiased">
            {/* Provider uses useSearchParams — Suspense required so /shop/checkout
                (Buy Now) does not blank the place-order page. */}
            <Suspense
                fallback={
                    <div className="flex min-h-screen items-center justify-center">
                        <MarketplaceLoadingPanel />
                    </div>
                }
            >
                <MarketplaceProvider>{children}</MarketplaceProvider>
            </Suspense>
        </div>
    )
}
