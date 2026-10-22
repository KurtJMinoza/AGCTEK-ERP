'use client'

import { useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiOutlineArrowLeft } from 'react-icons/hi'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import AuthBrandScene from '../components/AuthBrandScene'
import MarketplaceGmailAuthForm from '../components/MarketplaceGmailAuthForm'
import {
    MARKETPLACE_ACCOUNT_PATH,
    MARKETPLACE_PATH,
    safeReturnPath,
} from '../host'
import {
    BRAND_GRID_SURFACE,
    MARKETPLACE_LOGO_SRC,
    MARKETPLACE_NAME,
} from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'
import { useMarketplaceCartStore } from '../store/useMarketplaceCartStore'
import { syncShopperCartAfterAuth } from '@/modules/storefront/shared/syncShopperCartAfterAuth'
import type { verifyShopEmailCode } from '@/services/storefront/shopAuthService'

type MarketplaceAuthPageProps = {
    initialMode?: 'sign-in' | 'sign-up'
    next?: string | null
}

const MarketplaceAuthPage = ({ next }: MarketplaceAuthPageProps) => {
    const router = useRouter()
    const returnPath = safeReturnPath(next)
    const applySession = useMarketplaceClientStore((s) => s.applyShopSession)
    const guestItems = useMarketplaceCartStore((s) => s.items)

    useEffect(() => {
        if (useMarketplaceClientStore.getState().client) {
            router.replace(returnPath)
        }
    }, [returnPath, router])

    const handleGoogleAuthenticated = useCallback(
        async (
            session: Awaited<
                ReturnType<typeof verifyShopEmailCode>
            >,
        ) => {
            applySession(session)
            const merged = await syncShopperCartAfterAuth(
                session,
                guestItems,
                (p) => p.sku,
            )
            useMarketplaceCartStore.setState({ items: merged })

            toast.push(
                <Notification type="success" title="Welcome" closable>
                    {session.needsProfile
                        ? 'Your Gmail is verified. Complete your profile when ready.'
                        : 'You are now signed in.'}
                </Notification>,
                { placement: 'top-end' },
            )

            if (session.needsProfile && returnPath === MARKETPLACE_PATH) {
                router.replace(MARKETPLACE_ACCOUNT_PATH)
            } else {
                router.replace(returnPath)
            }
        },
        [applySession, guestItems, returnPath, router],
    )

    return (
        <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-white lg:min-h-screen">
            <aside
                className={`relative z-10 flex min-h-[220px] w-full shrink-0 flex-col items-center justify-center overflow-hidden px-6 py-10 ${BRAND_GRID_SURFACE} lg:absolute lg:left-0 lg:top-0 lg:h-full lg:min-h-0 lg:w-1/2 lg:px-10 lg:py-12`}
            >
                <AuthBrandScene />
                <div className="relative z-20 flex max-w-md flex-col items-center text-center">
                    <div className="relative h-24 w-24 rounded-full shadow-lg lg:h-32 lg:w-32">
                        <Image
                            src={MARKETPLACE_LOGO_SRC}
                            alt={`${MARKETPLACE_NAME} logo`}
                            fill
                            priority
                            sizes="128px"
                            className="object-contain"
                        />
                    </div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.4em] text-shop-300 lg:mt-8">
                        {MARKETPLACE_NAME}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold leading-tight text-white lg:mt-4 lg:text-4xl">
                        Seamless Shopping, Direct to Your Door
                    </h2>
                </div>
            </aside>

            <main className="relative z-20 flex min-h-0 flex-1 w-full bg-white px-6 py-10 sm:px-10 lg:absolute lg:left-1/2 lg:top-0 lg:h-full lg:w-1/2 lg:overflow-y-auto lg:py-12">
                <div className="m-auto w-full max-w-md">
                    <Link
                        href={MARKETPLACE_PATH}
                        className="mb-10 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-shop-700"
                    >
                        <HiOutlineArrowLeft aria-hidden />
                        Back to {MARKETPLACE_NAME}
                    </Link>
                    <MarketplaceGmailAuthForm
                        returnPath={returnPath}
                        onGoogleAuthenticated={handleGoogleAuthenticated}
                    />
                </div>
            </main>
        </div>
    )
}

export default MarketplaceAuthPage
