'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineShoppingBag,
    HiOutlineUser,
} from 'react-icons/hi'
import StorefrontLogo from '@/components/storefront/retail/StorefrontLogo'
import { STOREFRONT_NAV } from '@/components/storefront/retail/Navbar'
import { AWIC_BRAND } from '@/modules/storefront/retail/brand'
import { useRetailCartStore } from '@/modules/storefront/retail/store/retailCartStore'
import { useRetailClientStore } from '@/modules/storefront/retail/store/retailClientStore'

const MARQUEE = `${AWIC_BRAND.shortName} — ${AWIC_BRAND.initials} — Everyday goods — New drops — Emerald & gold — Bags — Vitamins — `

type StorefrontSiteHeaderProps = {
    showBack?: boolean
}

/**
 * Shared AWIC storefront chrome — marquee + sticky header with centered logo,
 * nav, account, and bag. Back uses browser history (previous page), not home.
 */
export default function StorefrontSiteHeader({
    showBack = true,
}: StorefrontSiteHeaderProps) {
    const router = useRouter()
    const openDrawer = useRetailCartStore((s) => s.openDrawer)
    const cartCount = useRetailCartStore((s) => s.itemCount())
    const { client, openLogin } = useRetailClientStore()
    const loginLabel = client
        ? client.fullName.split(' ')[0] || 'Account'
        : 'Login'

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back()
            return
        }
        router.push('/awic')
    }

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
                    <div className="flex items-center gap-5">
                        {showBack ? (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="inline-flex items-center gap-2 font-storefront-body text-[15px] font-medium uppercase tracking-[0.08em] text-brand-ink transition-colors hover:text-brand-gold"
                            >
                                <HiOutlineArrowLeft className="text-xl text-brand-gold" />
                                <span className="hidden sm:inline">Back</span>
                            </button>
                        ) : null}
                        <nav className="hidden items-center gap-6 lg:flex">
                            {STOREFRONT_NAV.filter(
                                (item) => item.id !== 'all',
                            ).map((item) => (
                                <Link
                                    key={item.id}
                                    href="/awic"
                                    className="font-storefront-body text-[15px] font-medium uppercase tracking-[0.08em] text-brand-ink transition-colors hover:text-brand-gold"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <Link
                        href="/awic"
                        aria-label={`${AWIC_BRAND.shortName} home`}
                        className="justify-self-center"
                    >
                        <StorefrontLogo size="md" priority />
                    </Link>

                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <button
                            type="button"
                            onClick={openLogin}
                            className="hidden items-center gap-2 px-3 py-2 font-storefront-body text-[15px] font-medium uppercase tracking-[0.08em] text-brand-ink transition-colors hover:text-brand-gold sm:inline-flex"
                        >
                            <HiOutlineUser className="text-xl text-brand-gold" />
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
                            aria-label="Open bag"
                            className="relative p-2.5 text-brand-ink/70 transition-colors hover:text-brand-gold"
                            onClick={openDrawer}
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
            </header>
        </>
    )
}
