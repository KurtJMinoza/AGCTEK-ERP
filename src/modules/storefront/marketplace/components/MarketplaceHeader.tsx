'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    HiOutlineClipboardList,
    HiOutlineSearch,
    HiOutlineShoppingBag,
    HiOutlineShoppingCart,
    HiOutlineUserCircle,
    HiX,
} from 'react-icons/hi'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { productsHref } from '../browseQuery'
import { MARKETPLACE_PATH } from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import { MARKETPLACE_NAME } from '../marketplaceUi'
import { useMarketplaceBrowseStore } from '../store/useMarketplaceBrowseStore'

type MarketplaceHeaderProps = {
    /** Enter in the search box; defaults to opening the products page with the query. */
    onSearchSubmit?: () => void
}

const ICON_BUTTON = '!text-gray-500 hover:!text-emerald-600'

/** Sticky marketplace top bar: home logo, product search, orders, account and cart. */
const MarketplaceHeader = ({ onSearchSubmit }: MarketplaceHeaderProps) => {
    const router = useRouter()
    const { signedInClient, itemCount, openCart, openOrders, openAccount } =
        useMarketplace()
    const search = useMarketplaceBrowseStore((s) => s.search)
    const setSearch = useMarketplaceBrowseStore((s) => s.setSearch)
    const resetBrowse = useMarketplaceBrowseStore((s) => s.reset)

    const submitSearch = () => {
        if (onSearchSubmit) onSearchSubmit()
        else if (search.trim()) router.push(productsHref({ q: search }))
    }

    const cartButton = (
        <Button
            size="sm"
            variant="plain"
            className={ICON_BUTTON}
            icon={<HiOutlineShoppingCart className="text-xl" />}
            aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
            onClick={openCart}
        />
    )

    return (
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
                <Link
                    href={MARKETPLACE_PATH}
                    aria-label={`${MARKETPLACE_NAME} home`}
                    className="group flex shrink-0 items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    onClick={() => {
                        resetBrowse()
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm shadow-emerald-500/30 transition-transform duration-200 group-hover:scale-105">
                        <HiOutlineShoppingBag className="text-lg" aria-hidden />
                    </span>
                    <span className="hidden text-base font-semibold tracking-tight text-gray-900 transition-colors group-hover:text-emerald-700 md:inline">
                        {MARKETPLACE_NAME}
                    </span>
                </Link>
                <div className="mx-auto min-w-0 max-w-2xl flex-1">
                    <Input
                        size="sm"
                        className="!rounded-full !border-gray-100 !bg-gray-50 focus:!border-emerald-500 focus:!bg-white focus:!ring-emerald-500"
                        prefix={
                            <HiOutlineSearch className="text-lg text-gray-400" />
                        }
                        suffix={
                            search ? (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    onClick={() => setSearch('')}
                                >
                                    <HiX />
                                </button>
                            ) : null
                        }
                        type="search"
                        enterKeyHint="search"
                        placeholder="Search products, brands and stores"
                        aria-label="Search products"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitSearch()
                            else if (e.key === 'Escape') setSearch('')
                        }}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        size="sm"
                        variant="plain"
                        className={ICON_BUTTON}
                        icon={<HiOutlineClipboardList className="text-xl" />}
                        aria-label="My orders"
                        onClick={openOrders}
                    >
                        <span className="hidden text-sm font-medium lg:inline">
                            My Orders
                        </span>
                    </Button>
                    <Button
                        size="sm"
                        variant="plain"
                        className={ICON_BUTTON}
                        icon={<HiOutlineUserCircle className="text-xl" />}
                        aria-label={signedInClient ? 'Your account' : 'Sign in'}
                        onClick={openAccount}
                    >
                        <span className="hidden max-w-[8rem] truncate text-sm font-medium lg:inline">
                            {signedInClient
                                ? signedInClient.fullName.split(' ')[0]
                                : 'Sign in'}
                        </span>
                    </Button>
                    {itemCount > 0 ? (
                        <Badge
                            content={itemCount}
                            maxCount={99}
                            innerClass="!bg-rose-500"
                        >
                            {cartButton}
                        </Badge>
                    ) : (
                        cartButton
                    )}
                </div>
            </div>
        </header>
    )
}

export default MarketplaceHeader
