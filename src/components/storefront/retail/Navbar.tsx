'use client'

import { useState } from 'react'
import StorefrontLogo from '@/components/storefront/retail/StorefrontLogo'
import classNames from '@/utils/classNames'
import {
    HiOutlineSearch,
    HiOutlineShoppingBag,
    HiOutlineUser,
    HiOutlineX,
} from 'react-icons/hi'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import type { RetailCatalogCategoryFilter } from '@/types/storefront/retail'

export const STOREFRONT_NAV: Array<{
    id: RetailCatalogCategoryFilter
    label: string
}> = [
    { id: 'all', label: 'Shop' },
    { id: 'vitamins', label: 'Vitamins' },
    { id: 'bags', label: 'Bags' },
    { id: 'general', label: 'Goods' },
]

const MARQUEE = `${AWIC_BRAND.shortName} — ${AWIC_BRAND.initials} — Everyday goods — New drops — Emerald & gold — Bags — Vitamins — `

type StorefrontNavbarProps = {
    category: RetailCatalogCategoryFilter
    onCategoryChange: (category: RetailCatalogCategoryFilter) => void
    query: string
    onQueryChange: (query: string) => void
    cartCount: number
    onOpenCart: () => void
    onHome: () => void
    onScrollToCatalog: () => void
}

const navLinkClass =
    'relative font-storefront-body text-[15px] font-medium uppercase tracking-[0.08em] transition-colors after:absolute after:-bottom-1 after:left-0 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-brand-gold after:transition-transform after:duration-300 hover:text-brand-gold hover:after:scale-x-100'

export default function StorefrontNavbar({
    category,
    onCategoryChange,
    query,
    onQueryChange,
    cartCount,
    onOpenCart,
    onHome,
    onScrollToCatalog,
}: StorefrontNavbarProps) {
    const [searchOpen, setSearchOpen] = useState(false)
    const { client, openLogin } = useRetailClientStore()
    const loginLabel = client
        ? client.fullName.split(' ')[0] || 'Account'
        : 'Login'

    return (
        <>
            <div className="overflow-hidden bg-brand-deep py-2.5">
                <div className="flex w-max animate-retail-marquee whitespace-nowrap font-storefront-body text-sm font-medium tracking-wide text-brand-gold-soft">
                    <span className="px-6">{MARQUEE.repeat(8)}</span>
                    <span className="px-6" aria-hidden>
                        {MARQUEE.repeat(8)}
                    </span>
                </div>
            </div>

            <header className="sticky top-0 z-40 border-b border-brand-line/80 bg-brand-canvas/90 shadow-[0_8px_30px_rgba(10,42,32,0.04)] backdrop-blur-xl">
                <div className="mx-auto grid max-w-[1320px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-4 lg:px-10">
                    <nav className="hidden items-center gap-7 md:flex lg:gap-9">
                        {STOREFRONT_NAV.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    onCategoryChange(item.id)
                                    onScrollToCatalog()
                                }}
                                className={classNames(
                                    navLinkClass,
                                    category === item.id
                                        ? 'text-brand-gold after:scale-x-100'
                                        : 'text-brand-ink',
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <div className="md:hidden" />

                    <button
                        type="button"
                        aria-label={`${AWIC_BRAND.shortName} home`}
                        className="justify-self-center"
                        onClick={onHome}
                    >
                        <StorefrontLogo size="md" priority />
                    </button>

                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <button
                            type="button"
                            onClick={openLogin}
                            className="hidden items-center gap-2 px-3 py-2 font-storefront-body text-[15px] font-medium text-brand-ink transition-colors hover:text-brand-gold sm:inline-flex"
                        >
                            <HiOutlineUser className="text-xl" />
                            {loginLabel}
                        </button>
                        <button
                            type="button"
                            onClick={openLogin}
                            aria-label={client ? 'Delivery details' : 'Login'}
                            className="inline-flex p-2.5 text-brand-ink/70 transition-colors hover:text-brand-gold sm:hidden"
                        >
                            <HiOutlineUser className="text-2xl" />
                        </button>
                        <button
                            type="button"
                            aria-label="Search"
                            className="p-2.5 text-brand-ink/70 transition-colors hover:text-brand-gold"
                            onClick={() => setSearchOpen((open) => !open)}
                        >
                            {searchOpen ? (
                                <HiOutlineX className="text-2xl" />
                            ) : (
                                <HiOutlineSearch className="text-2xl" />
                            )}
                        </button>
                        <button
                            type="button"
                            aria-label="Open bag"
                            className="relative p-2.5 text-brand-ink/70 transition-colors hover:text-brand-gold"
                            onClick={onOpenCart}
                        >
                            <HiOutlineShoppingBag className="text-2xl" />
                            {cartCount > 0 ? (
                                <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center bg-brand-gold px-1 font-storefront-body text-xs font-semibold text-brand-deep">
                                    {cartCount}
                                </span>
                            ) : null}
                        </button>
                    </div>
                </div>

                {searchOpen ? (
                    <div className="border-t border-brand-line bg-brand-sage/50 px-6 py-4 lg:px-10">
                        <input
                            autoFocus
                            value={query}
                            onChange={(event) =>
                                onQueryChange(event.target.value)
                            }
                            placeholder="Search products…"
                            className="w-full border-0 border-b border-brand-ink/15 bg-transparent pb-2 font-storefront-body text-base text-brand-ink outline-none placeholder:text-brand-ink/35 focus:border-brand-gold"
                        />
                    </div>
                ) : null}

                <div className="flex gap-6 overflow-x-auto border-t border-brand-line px-6 py-3.5 md:hidden">
                    {STOREFRONT_NAV.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onCategoryChange(item.id)}
                            className={classNames(
                                'shrink-0 font-storefront-body text-[15px] font-medium uppercase tracking-[0.08em]',
                                category === item.id
                                    ? 'text-brand-gold'
                                    : 'text-brand-ink/55 hover:text-brand-gold',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </header>
        </>
    )
}
