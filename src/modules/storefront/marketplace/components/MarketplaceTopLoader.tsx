'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { MARKETPLACE_PATH } from '../host'
import { useMarketplace } from '../MarketplaceProvider'
import MarketplaceLoadingPanel from './MarketplaceLoadingPanel'
import { useMarketplaceLoadingStore } from '../store/useMarketplaceLoadingStore'

const TRICKLE_CAP = 90
/** Keep intentional loaders (auth / nav) on screen long enough to read. */
const MIN_VISIBLE_MS = 520
/** Shorter floor for the refresh top-bar so it does not feel stuck. */
const MIN_BOOT_VISIBLE_MS = 280
const COMPLETE_FADE_MS = 220

const isShopPath = (pathname: string) =>
    pathname === MARKETPLACE_PATH ||
    pathname.startsWith(`${MARKETPLACE_PATH}/`) ||
    pathname === '/' ||
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname.startsWith('/sign-in/')

/**
 * Thin top progress line + centered full-page loader for marketplace
 * navigations and auth. Also runs the top bar on full-page refresh until
 * the shop session store has hydrated.
 */
const MarketplaceTopLoader = () => {
    const { hydrated } = useMarketplace()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const active = useMarketplaceLoadingStore((s) => s.active)
    const label = useMarketplaceLoadingStore((s) => s.label)
    const overlay = useMarketplaceLoadingStore((s) => s.overlay)
    const generation = useMarketplaceLoadingStore((s) => s.generation)
    const start = useMarketplaceLoadingStore((s) => s.start)
    const stop = useMarketplaceLoadingStore((s) => s.stop)

    const [progress, setProgress] = useState(18)
    const [barVisible, setBarVisible] = useState(true)
    const [overlayVisible, setOverlayVisible] = useState(false)
    const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const shownAtRef = useRef(Date.now())
    const bootDoneRef = useRef(false)
    const routeKey = `${pathname}?${searchParams.toString()}`
    const prevRouteRef = useRef(routeKey)
    const activeGenerationRef = useRef(0)
    const overlayForSessionRef = useRef(false)

    const clearTrickle = () => {
        if (trickleRef.current) {
            clearInterval(trickleRef.current)
            trickleRef.current = null
        }
    }

    const clearFinishTimers = () => {
        if (finishTimerRef.current) {
            clearTimeout(finishTimerRef.current)
            finishTimerRef.current = null
        }
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
    }

    const beginVisual = (withOverlay: boolean) => {
        clearTrickle()
        clearFinishTimers()
        shownAtRef.current = Date.now()
        overlayForSessionRef.current = withOverlay
        setBarVisible(true)
        setOverlayVisible(withOverlay)
        setProgress(18)
        trickleRef.current = setInterval(() => {
            setProgress((value) => {
                if (value >= TRICKLE_CAP) return value
                const step = value < 45 ? 10 : value < 75 ? 4 : 1.5
                return Math.min(TRICKLE_CAP, value + step)
            })
        }, 160)
    }

    const endVisual = () => {
        clearTrickle()
        setOverlayVisible(false)
        setProgress(100)
        hideTimerRef.current = setTimeout(() => {
            setBarVisible(false)
            setProgress(0)
            hideTimerRef.current = null
        }, COMPLETE_FADE_MS)
    }

    // Full-page refresh / first paint: top bar until the shop has hydrated.
    useEffect(() => {
        if (!hydrated) {
            start(undefined, { overlay: false })
            return
        }
        if (bootDoneRef.current) return
        bootDoneRef.current = true
        // Do not cancel a labeled auth/nav session that started during boot.
        const state = useMarketplaceLoadingStore.getState()
        if (state.label) return
        if (!state.overlay) stop()
    }, [hydrated, start, stop])

    // Same-origin shop link clicks start the loader before the route settles.
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return
            }
            const target = event.target as Element | null
            const anchor = target?.closest?.('a')
            if (
                !anchor ||
                anchor.target === '_blank' ||
                anchor.hasAttribute('download')
            ) {
                return
            }
            const href = anchor.getAttribute('href')
            if (
                !href ||
                href.startsWith('#') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:')
            ) {
                return
            }
            let url: URL
            try {
                url = new URL(href, window.location.href)
            } catch {
                return
            }
            if (url.origin !== window.location.origin) return
            if (!isShopPath(url.pathname)) return
            const nextKey = `${url.pathname}?${url.searchParams.toString()}`
            const currentKey = `${window.location.pathname}?${window.location.search.slice(1)}`
            if (nextKey === currentKey) return
            start()
        }
        document.addEventListener('click', onClick, true)
        return () => document.removeEventListener('click', onClick, true)
    }, [start])

    // Route change completes navigation loading.
    useEffect(() => {
        if (prevRouteRef.current === routeKey) return
        prevRouteRef.current = routeKey
        if (useMarketplaceLoadingStore.getState().active) stop()
    }, [routeKey, stop])

    // Drive visuals from the shared active flag.
    useEffect(() => {
        if (active) {
            activeGenerationRef.current = generation
            beginVisual(overlay)
            return
        }

        if (!barVisible && progress === 0) return

        const generationWhenStopped = activeGenerationRef.current
        const minMs = overlayForSessionRef.current
            ? MIN_VISIBLE_MS
            : MIN_BOOT_VISIBLE_MS
        const elapsed = Date.now() - shownAtRef.current
        const wait = Math.max(0, minMs - elapsed)

        finishTimerRef.current = setTimeout(() => {
            const state = useMarketplaceLoadingStore.getState()
            if (state.active && state.generation !== generationWhenStopped) {
                return
            }
            if (state.active) return
            endVisual()
        }, wait)

        return () => {
            if (finishTimerRef.current) {
                clearTimeout(finishTimerRef.current)
                finishTimerRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, generation, overlay])

    useEffect(
        () => () => {
            clearTrickle()
            clearFinishTimers()
        },
        [],
    )

    return (
        <>
            <div
                aria-hidden
                className={`pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[2px] origin-left bg-shop-600 transition-opacity duration-200 ${
                    barVisible && progress > 0 ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                    transform: `scaleX(${Math.max(progress, 0) / 100})`,
                    boxShadow: '0 0 8px rgba(5, 150, 105, 0.4)',
                }}
            />

            {overlayVisible ? (
                <div
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/85 backdrop-blur-[2px]"
                >
                    <MarketplaceLoadingPanel label={label} />
                </div>
            ) : null}
        </>
    )
}

export default MarketplaceTopLoader
