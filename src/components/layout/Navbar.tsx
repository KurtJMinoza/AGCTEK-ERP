'use client'

import Link from 'next/link'
import { HiOutlineShoppingCart } from 'react-icons/hi'
import MarketplaceHeader from '@/modules/storefront/marketplace/components/MarketplaceHeader'
import { CART_PATH } from '@/modules/storefront/marketplace/host'

import MarketplaceNotificationBell from '@/modules/storefront/marketplace/components/MarketplaceNotificationBell'

export { MarketplaceHeader as default }
export { MarketplaceHeader as Navbar }
export { MarketplaceNotificationBell, MarketplaceNotificationBell as NotificationNavIcon }

/** Standalone Cart link helper for navbars */
export const CartNavIcon = ({ itemCount = 0 }: { itemCount?: number }) => (
    <Link
        href="/cart"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-emerald-600 focus:outline-none"
        aria-label={`Cart, ${itemCount} items`}
    >
        <HiOutlineShoppingCart className="text-xl" />
        {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {itemCount > 99 ? '99+' : itemCount}
            </span>
        )}
    </Link>
)

