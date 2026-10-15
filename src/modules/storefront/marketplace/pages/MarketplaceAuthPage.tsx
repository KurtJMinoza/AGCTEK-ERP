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
    MARKETPLACE_PATH,
    MARKETPLACE_SIGN_IN_PATH,
    MARKETPLACE_SIGN_UP_PATH,
    marketplaceAuthHref,
    safeReturnPath,
} from '../host'
import { MARKETPLACE_LOGO_SRC, MARKETPLACE_NAME } from '../marketplaceUi'
import { useMarketplaceClientStore } from '../store/useMarketplaceClientStore'

/** Slow-moving green blobs behind the logo; purely decorative. */
const BrandBackdrop = () => (
    <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
    >
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] animate-[spin_40s_linear_infinite] rounded-full bg-shop-500 opacity-50 blur-3xl [transform-origin:65%_60%]" />
        <div className="absolute -bottom-40 -right-24 h-[32rem] w-[32rem] animate-[spin_55s_linear_infinite_reverse] rounded-full bg-leaf-500 opacity-40 blur-3xl [transform-origin:35%_40%]" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 animate-pulse rounded-full bg-leaf-400 opacity-30 blur-3xl [animation-duration:6s]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(7,27,56,0.6)_75%)]" />
    </div>
)

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
        className={`absolute left-0 top-0 z-10 hidden h-full w-1/2 overflow-hidden bg-gradient-to-br from-shop-800 via-shop-900 to-shop-950 lg:flex lg:items-center lg:justify-center ${SWAP_TRANSITION} ${
            isSignUp ? 'translate-x-0' : 'translate-x-full'
        }`}
    >
        <BrandBackdrop />
        <div
            className={`relative z-10 flex max-w-md flex-col items-center px-10 text-center ${contentFade(isMoving)}`}
        >
            <div className="relative h-40 w-40 drop-shadow-[0_20px_40px_rgba(169,206,90,0.35)]">
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
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white">
                Join the AWIC &amp; LPG Insider Community
            </h2>
            <p className="mt-4 text-base leading-relaxed text-shop-100/80">
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
                        onAuthenticated={handleAuthenticated}
                    />
                </div>
            </main>
        </div>
    )
}

export default MarketplaceAuthPage
