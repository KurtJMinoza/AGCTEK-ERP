'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HiOutlineArrowLeft } from 'react-icons/hi'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import MarketplaceAuthForm, {
    type MarketplaceAuthMode,
} from '../components/MarketplaceAuthForm'
import {
    MARKETPLACE_ACCOUNT_PATH,
    MARKETPLACE_OTP_PATH,
    MARKETPLACE_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    MARKETPLACE_SIGN_UP_PATH,
    marketplaceAuthHref,
    safeReturnPath,
} from '../host'
import {
    BRAND_GRID_SURFACE,
    MARKETPLACE_LOGO_SRC,
    MARKETPLACE_NAME,
} from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

const SWAP_MS = 800
const SWAP_TRANSITION =
    'transition-transform duration-[800ms] ease-[cubic-bezier(0.77,0,0.175,1)]'

const contentFade = (isMoving: boolean) =>
    `transition-opacity duration-300 ${isMoving ? 'lg:opacity-60' : 'opacity-100'}`

const BrandingColumn = ({
    isSignUp,
    isMoving,
}: {
    isSignUp: boolean
    isMoving: boolean
}) => (
    <aside
        className={`absolute left-0 top-0 z-10 hidden h-full w-1/2 overflow-hidden ${BRAND_GRID_SURFACE} lg:flex lg:items-center lg:justify-center ${SWAP_TRANSITION} ${
            isSignUp ? 'translate-x-0' : 'translate-x-full'
        }`}
    >
        <div
            className={`relative z-10 flex max-w-md flex-col items-center px-10 text-center ${contentFade(isMoving)}`}
        >
            <div className="relative h-40 w-40">
                <Image
                    src={MARKETPLACE_LOGO_SRC}
                    alt={`${MARKETPLACE_NAME} logo`}
                    fill
                    priority
                    sizes="160px"
                    className="object-contain"
                />
            </div>
            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.3em] text-shop-300">
                {MARKETPLACE_NAME}
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white drop-shadow-md">
                Join the AWIC &amp; LPG Insider Community
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/85 drop-shadow-md">
                Member-only pricing, faster checkout and live delivery tracking
                across every store in the marketplace.
            </p>
        </div>
    </aside>
)

type MarketplaceAuthPageProps = {
    initialMode: MarketplaceAuthMode
    /** Where to send the shopper afterwards (same-origin paths only). */
    next?: string | null
}

/** Full-page shopper sign-in / account creation; registering also creates the RETAIL SD customer. */
const MarketplaceAuthPage = ({
    initialMode,
    next,
}: MarketplaceAuthPageProps) => {
    const router = useRouter()
    const returnPath = safeReturnPath(next)
    const [isSignUp, setIsSignUp] = useState(initialMode === 'sign-up')
    const mode: MarketplaceAuthMode = isSignUp ? 'sign-up' : 'sign-in'
    const [isMoving, setIsMoving] = useState(false)
    const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Already signed in when the page opens: go straight on.
    useEffect(() => {
        if (useMarketplaceClientStore.getState().client)
            router.replace(returnPath)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(
        () => () => {
            if (moveTimer.current) clearTimeout(moveTimer.current)
        },
        [],
    )

    /** Keeps the address bar on /sign-in or /sign-up without reloading the page. */
    const changeMode = (nextMode: MarketplaceAuthMode) => {
        setIsSignUp(nextMode === 'sign-up')
        setIsMoving(true)
        if (moveTimer.current) clearTimeout(moveTimer.current)
        moveTimer.current = setTimeout(() => setIsMoving(false), SWAP_MS - 300)
        const page =
            nextMode === 'sign-in'
                ? MARKETPLACE_SIGN_IN_PATH
                : MARKETPLACE_SIGN_UP_PATH
        const url = marketplaceAuthHref(page, next)
        const onDedicatedHost =
            !window.location.pathname.startsWith(MARKETPLACE_PATH)
        window.history.replaceState(
            window.history.state,
            '',
            onDedicatedHost ? url.slice(MARKETPLACE_PATH.length) : url,
        )
    }

    const handleAuthenticated = (mode: MarketplaceAuthMode) => {
        toast.push(
            <Notification
                type="success"
                title={mode === 'sign-in' ? 'Welcome back' : 'Account created'}
                closable
            >
                {mode === 'sign-in'
                    ? 'You are now signed in.'
                    : 'Add your phone number and delivery addresses in My Account.'}
            </Notification>,
            { placement: 'top-end' },
        )
        router.replace(
            mode === 'sign-up' && returnPath === MARKETPLACE_PATH
                ? MARKETPLACE_ACCOUNT_PATH
                : returnPath,
        )
    }

    return (
        <div className="relative flex min-h-screen w-full overflow-hidden">
            <BrandingColumn isSignUp={isSignUp} isMoving={isMoving} />

            <main
                className={`flex w-full bg-white px-6 py-12 sm:px-10 lg:absolute lg:left-0 lg:top-0 lg:h-full lg:w-1/2 lg:overflow-y-auto ${SWAP_TRANSITION} ${
                    isSignUp ? 'lg:translate-x-full' : 'lg:translate-x-0'
                }`}
            >
                <div
                    className={`m-auto w-full max-w-md ${contentFade(isMoving)}`}
                >
                    <Link
                        href={MARKETPLACE_PATH}
                        className="mb-10 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-shop-700"
                    >
                        <HiOutlineArrowLeft aria-hidden />
                        Back to {MARKETPLACE_NAME}
                    </Link>
                    <MarketplaceAuthForm
                        mode={mode}
                        onModeChange={changeMode}
                        onMobileSubmit={() =>
                            router.push(
                                returnPath === MARKETPLACE_PATH
                                    ? MARKETPLACE_OTP_PATH
                                    : `${MARKETPLACE_OTP_PATH}?${new URLSearchParams({ next: returnPath })}`,
                            )
                        }
                        onAuthenticated={handleAuthenticated}
                    />
                </div>
            </main>
        </div>
    )
}

export default MarketplaceAuthPage
