'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    HiOutlineChevronDown,
    HiOutlineLogout,
    HiOutlineSearch,
    HiOutlineShoppingBag,
    HiOutlineShoppingCart,
    HiOutlineUserCircle,
    HiX,
} from 'react-icons/hi'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import { productsHref } from '../browseQuery'
import { MARKETPLACE_PATH } from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import { MARKETPLACE_NAME } from '../marketplaceUi'
import { useMarketplaceBrowseStore } from '../store/useMarketplaceBrowseStore'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

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
    const logout = useMarketplaceClientStore((s) => s.logout)

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
                    {signedInClient ? (
                        <Dropdown
                            renderTitle={
                                <Button
                                    size="sm"
                                    variant="plain"
                                    className={ICON_BUTTON}
                                    icon={
                                        <HiOutlineUserCircle className="text-xl" />
                                    }
                                    aria-label="Your account"
                                >
                                    <span className="hidden max-w-[7rem] truncate text-sm font-medium lg:inline">
                                        {signedInClient.firstName ||
                                            signedInClient.fullName.split(' ')[0]}
                                    </span>
                                    <HiOutlineChevronDown className="hidden text-sm lg:inline" />
                                </Button>
                            }
                            placement="bottom-end"
                            menuClass="!z-40 !mt-1 !min-w-[220px] !rounded-xl !border !border-gray-100 !bg-white !p-1 !shadow-lg"
                        >
                            <Dropdown.Item
                                variant="header"
                                className="!px-3 !py-2"
                            >
                                <span className="block text-sm font-semibold text-gray-900">
                                    {signedInClient.fullName}
                                </span>
                                <span className="block max-w-[190px] truncate text-xs text-gray-500">
                                    {signedInClient.email}
                                </span>
                            </Dropdown.Item>
                            <Dropdown.Item variant="divider" />
                            <Dropdown.Item
                                className="!py-2 !text-sm !text-gray-700 hover:!text-emerald-700"
                                onClick={() => {
                                    openAccount()
                                }}
                            >
                                My Account
                            </Dropdown.Item>
                            <Dropdown.Item
                                className="!py-2 !text-sm !text-gray-700 hover:!text-emerald-700"
                                onClick={() => {
                                    openOrders()
                                }}
                            >
                                My Orders
                            </Dropdown.Item>
                            <Dropdown.Item variant="divider" />
                            <Dropdown.Item
                                className="!py-2 !text-sm !text-red-600 hover:!bg-red-50"
                                onClick={() => {
                                    logout()
                                    router.push(MARKETPLACE_PATH)
                                }}
                            >
                                <span className="flex items-center gap-2">
                                    <HiOutlineLogout className="text-lg" />
                                    Sign out
                                </span>
                            </Dropdown.Item>
                        </Dropdown>
                    ) : (
                        <Button
                            size="sm"
                            variant="plain"
                            className={ICON_BUTTON}
                            icon={<HiOutlineUserCircle className="text-xl" />}
                            aria-label="Sign in"
                            onClick={openAccount}
                        >
                            <span className="hidden max-w-[8rem] truncate text-sm font-medium lg:inline">
                                Sign in
                            </span>
                        </Button>
                    )}
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
