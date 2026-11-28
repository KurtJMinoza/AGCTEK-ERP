import { Suspense, type ReactNode } from 'react'
import MarketplaceProvider from '@/modules/storefront/marketplace/MarketplaceProvider'
import MarketplaceLoadingPanel from '@/modules/storefront/marketplace/components/MarketplaceLoadingPanel'
import { MARKETPLACE_PAGE_BG } from '@/modules/storefront/marketplace/marketplaceUi'

/** Marketplace shell: light brand canvas, independent of the ERP theme. */
export default function ShopLayout({ children }: { children: ReactNode }) {
    return (
        <div className={`min-h-screen ${MARKETPLACE_PAGE_BG}`}>
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
