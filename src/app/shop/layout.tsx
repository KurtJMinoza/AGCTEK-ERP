import type { ReactNode } from 'react'
import MarketplaceProvider from '@/modules/storefront/marketplace/MarketplaceProvider'

/** Marketplace shell: the storefront's own light canvas, independent of the ERP theme. */
export default function ShopLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-500 antialiased">
            <MarketplaceProvider>{children}</MarketplaceProvider>
        </div>
    )
}
