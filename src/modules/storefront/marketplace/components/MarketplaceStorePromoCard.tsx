'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Button from '@/components/ui/Button'
import classNames from '@/utils/classNames'
import { PRIMARY_BUTTON_CLASS } from '../marketplaceUi'

export type StorePromo = {
    divisionId: string
    storeName: string
    eyebrow: string
    headline: string
    body: ReactNode
    cta: string
    /** Decorative background photos (public paths); one is shown per visit. */
    photos: readonly string[]
    /** Brand-tinted shade that keeps the white copy readable over the photo. */
    shadeClass: string
    eyebrowClass: string
    buttonClass: string
}

type Slide = { promo: StorePromo; photo: string }

type MarketplaceStorePromoCardProps = {
    promos: readonly StorePromo[]
    onShop: (divisionId: string) => void
    className?: string
    /** Time each store stays on screen, in ms. */
    interval?: number
}

/** Store order repeats, each visit showing that store's next photo. */
const buildSlides = (promos: readonly StorePromo[]): Slide[] => {
    const rounds = Math.max(0, ...promos.map((p) => p.photos.length))
    return Array.from({ length: rounds }, (_, round) =>
        promos
            .filter((promo) => promo.photos.length > 0)
            .map((promo) => ({
                promo,
                photo: promo.photos[round % promo.photos.length],
            })),
    ).flat()
}

/** Rotating "featured store" card: photo with slow zoom, brand shade, offer copy. */
const MarketplaceStorePromoCard = ({
    promos,
    onShop,
    className,
    interval = 7000,
}: MarketplaceStorePromoCardProps) => {
    const slides = useMemo(() => buildSlides(promos), [promos])
    const [{ active, previous }, setSlide] = useState({
        active: 0,
        previous: -1,
    })
    const [paused, setPaused] = useState(false)

    const goTo = (index: number) =>
        setSlide(({ active: current }) =>
            index === current
                ? { active: current, previous: -1 }
                : { active: index, previous: current },
        )

    useEffect(() => {
        if (paused || slides.length < 2) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return
        const timer = window.setTimeout(
            () =>
                setSlide({
                    active: (active + 1) % slides.length,
                    previous: active,
                }),
            interval,
        )
        return () => window.clearTimeout(timer)
    }, [active, paused, slides.length, interval])

    const current = slides[active]
    if (!current) return null
    const { promo } = current

    /** Next slide (after the current one) that features the chosen store. */
    const showStore = (divisionId: string) => {
        for (let step = 1; step <= slides.length; step++) {
            const index = (active + step) % slides.length
            if (slides[index].promo.divisionId === divisionId) {
                if (slides[active].promo.divisionId !== divisionId) goTo(index)
                return
            }
        }
    }

    return (
        <section
            aria-roledescription="carousel"
            aria-label="Featured official stores"
            className={classNames(
                'relative flex min-h-[22rem] flex-col justify-between overflow-hidden rounded-2xl bg-gray-900 p-8 shadow-sm sm:p-10 md:min-h-[26rem]',
                className,
            )}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <div aria-hidden className="absolute inset-0">
                {slides.map((slide, index) => (
                    <div
                        key={index}
                        className={classNames(
                            'absolute inset-0 transition-opacity duration-[1500ms] ease-in-out',
                            index === active ? 'opacity-100' : 'opacity-0',
                        )}
                    >
                        <Image
                            src={slide.photo}
                            alt=""
                            fill
                            priority={index === 0}
                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw"
                            className={classNames(
                                'object-cover object-center',
                                // The outgoing photo keeps its zoom while it fades out.
                                (index === active || index === previous) &&
                                    'animate-ken-burns',
                            )}
                        />
                        <div
                            className={classNames(
                                'absolute inset-0 bg-gradient-to-br to-transparent',
                                slide.promo.shadeClass,
                            )}
                        />
                    </div>
                ))}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            <div
                key={`copy-${active}`}
                className="relative z-10 animate-fade-up [text-shadow:0_1px_8px_rgb(0_0_0/0.35)]"
            >
                <span
                    className={classNames(
                        'text-xs font-semibold uppercase tracking-widest sm:text-sm',
                        promo.eyebrowClass,
                    )}
                >
                    {promo.eyebrow}
                </span>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {promo.headline}
                </p>
                <div className="mt-4 max-w-md text-sm leading-relaxed text-white/90 sm:text-base">
                    {promo.body}
                </div>
            </div>

            <div className="relative z-10 mt-6 flex items-center justify-between gap-4">
                <Button
                    key={`cta-${active}`}
                    className={classNames(
                        PRIMARY_BUTTON_CLASS,
                        'animate-fade-up',
                    )}
                    customColorClass={() => promo.buttonClass}
                    onClick={() => onShop(promo.divisionId)}
                >
                    {promo.cta}
                </Button>
                <div
                    className="flex items-center gap-1.5"
                    role="group"
                    aria-label="Choose store"
                >
                    {promos.map((item) => {
                        const selected = item.divisionId === promo.divisionId
                        return (
                            <button
                                key={item.divisionId}
                                type="button"
                                aria-label={`Show ${item.storeName}`}
                                aria-pressed={selected}
                                className={classNames(
                                    'h-2 cursor-pointer rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                                    selected
                                        ? 'w-6 bg-white'
                                        : 'w-2 bg-white/50 hover:bg-white/80',
                                )}
                                onClick={() => showStore(item.divisionId)}
                            />
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

export default MarketplaceStorePromoCard
