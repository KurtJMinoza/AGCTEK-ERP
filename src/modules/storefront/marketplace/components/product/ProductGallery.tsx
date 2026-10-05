'use client'

import {
    useCallback,
    useRef,
    useState,
    type KeyboardEvent,
    type PointerEvent,
    type TouchEvent,
} from 'react'
import {
    HiOutlineArrowsExpand,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiPlay,
} from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import classNames from '@/utils/classNames'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { ProductImage } from '../../marketplaceUi'
import { productMedia, type Media } from './productContent'

const SWIPE_PX = 40
const ZOOM = 2.2

const ROUND_BUTTON =
    'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-gray-100 bg-white/90 text-gray-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'

const stopClick = {
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
}

const Arrows = ({
    onStep,
    className,
}: {
    onStep: (delta: number) => void
    className?: string
}) => (
    <>
        {(
            [
                [-1, 'left-3', HiOutlineChevronLeft, 'Previous photo'],
                [1, 'right-3', HiOutlineChevronRight, 'Next photo'],
            ] as const
        ).map(([delta, side, Icon, label]) => (
            <button
                key={label}
                type="button"
                aria-label={label}
                className={classNames(
                    'absolute top-1/2 -translate-y-1/2',
                    ROUND_BUTTON,
                    side,
                    className,
                )}
                onClick={(event) => {
                    event.stopPropagation()
                    onStep(delta)
                }}
            >
                <Icon className="text-lg" />
            </button>
        ))}
    </>
)

const Thumbnails = ({
    media,
    index,
    name,
    vertical,
    onSelect,
}: {
    media: Media[]
    index: number
    name: string
    vertical?: boolean
    onSelect: (index: number) => void
}) => (
    <ul
        className={classNames(
            'hide-scrollbar flex gap-2.5 overflow-auto',
            vertical && 'lg:max-h-[min(36rem,70vh)] lg:flex-col',
        )}
    >
        {media.map((item, i) => (
            <li key={`${item.src}-${i}`} className="shrink-0">
                <button
                    type="button"
                    aria-label={`Show ${item.kind === 'video' ? 'video' : 'photo'} ${i + 1}`}
                    aria-current={i === index}
                    className={classNames(
                        'relative block h-16 w-16 cursor-pointer overflow-hidden rounded-xl border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:h-20 sm:w-20',
                        item.kind === 'video' ? 'bg-black' : 'bg-white p-1.5',
                        i === index
                            ? 'border-emerald-500 shadow-sm'
                            : 'border-gray-100 opacity-70 hover:border-gray-200 hover:opacity-100',
                    )}
                    onClick={() => onSelect(i)}
                >
                    {item.kind === 'video' ? (
                        <>
                            <video
                                src={item.src}
                                preload="metadata"
                                muted
                                playsInline
                                className="pointer-events-none h-full w-full object-cover"
                            />
                            <HiPlay className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-white/90" />
                        </>
                    ) : (
                        <ProductImage
                            product={{ imageUrl: item.src, name }}
                            fit="contain"
                            sizes="80px"
                            className="h-full w-full !bg-transparent"
                        />
                    )}
                </button>
            </li>
        ))}
    </ul>
)

/**
 * Product page gallery: large stage with hover zoom (mouse), swipe (touch),
 * arrow keys, thumbnails, and a full-screen viewer.
 */
const ProductGallery = ({ product }: { product: SdProductRecord }) => {
    const media = productMedia(product)
    const slides: Media[] = media.length
        ? media
        : [{ kind: 'image', src: product.imageUrl }]
    const count = slides.length
    const [index, setIndex] = useState(0)
    const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
    const [viewerOpen, setViewerOpen] = useState(false)
    const touchStartX = useRef<number | null>(null)
    const current = slides[index] ?? slides[0]

    const step = useCallback(
        (delta: number) => {
            setZoom(null)
            setIndex((i) => (i + delta + count) % count)
        },
        [count],
    )

    const select = (i: number) => {
        setZoom(null)
        setIndex(i)
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if (count < 2) return
        if (event.key === 'ArrowLeft') step(-1)
        else if (event.key === 'ArrowRight') step(1)
    }

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || current.kind !== 'image') return
        const rect = event.currentTarget.getBoundingClientRect()
        setZoom({
            x: ((event.clientX - rect.left) / rect.width) * 100,
            y: ((event.clientY - rect.top) / rect.height) * 100,
        })
    }

    const swipe = {
        onTouchStart: (event: TouchEvent) => {
            touchStartX.current = event.touches[0]?.clientX ?? null
        },
        onTouchEnd: (event: TouchEvent) => {
            const start = touchStartX.current
            const end = event.changedTouches[0]?.clientX
            touchStartX.current = null
            if (count < 2 || start === null || end === undefined) return
            const delta = end - start
            if (Math.abs(delta) >= SWIPE_PX) step(delta < 0 ? 1 : -1)
        },
    }

    const renderSlide = (slide: Media, variant: 'stage' | 'viewer') =>
        slide.kind === 'video' ? (
            <video
                key={slide.src}
                src={slide.src}
                controls
                autoPlay
                muted
                playsInline
                className="h-full w-full animate-fade-up bg-black object-contain"
                onEnded={() => count > 1 && step(1)}
                {...stopClick}
            />
        ) : (
            <ProductImage
                key={slide.src}
                product={{ imageUrl: slide.src, name: product.name }}
                fit="contain"
                priority={variant === 'stage' && index === 0}
                sizes={
                    variant === 'viewer'
                        ? '(max-width: 1100px) 100vw, 1100px'
                        : '(max-width: 1024px) 100vw, 640px'
                }
                className="h-full w-full animate-fade-up !bg-transparent"
            />
        )

    return (
        <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start">
            {count > 1 ? (
                <Thumbnails
                    vertical
                    media={slides}
                    index={index}
                    name={product.name}
                    onSelect={select}
                />
            ) : null}

            <div
                role="group"
                aria-roledescription="carousel"
                aria-label={`${product.name} photos`}
                tabIndex={0}
                className={classNames(
                    'group relative aspect-square w-full min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                    current.kind === 'image' &&
                        (zoom ? 'cursor-zoom-in' : 'cursor-pointer'),
                )}
                onKeyDown={onKeyDown}
                onPointerMove={onPointerMove}
                onPointerLeave={() => setZoom(null)}
                onClick={() => current.kind === 'image' && setViewerOpen(true)}
                {...swipe}
            >
                <div
                    className={classNames(
                        'h-full w-full transition-transform duration-200 ease-out',
                        current.kind === 'image' && 'p-6 sm:p-10',
                    )}
                    style={
                        zoom
                            ? {
                                  transform: `scale(${ZOOM})`,
                                  transformOrigin: `${zoom.x}% ${zoom.y}%`,
                              }
                            : undefined
                    }
                >
                    {renderSlide(current, 'stage')}
                </div>

                {count > 1 ? (
                    <Arrows
                        className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
                        onStep={step}
                    />
                ) : null}
                <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between">
                    {count > 1 ? (
                        <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur">
                            {index + 1} / {count}
                        </span>
                    ) : (
                        <span />
                    )}
                    {current.kind === 'image' ? (
                        <button
                            type="button"
                            aria-label="View full screen"
                            className={classNames(
                                'pointer-events-auto',
                                ROUND_BUTTON,
                            )}
                            onClick={(event) => {
                                event.stopPropagation()
                                setViewerOpen(true)
                            }}
                        >
                            <HiOutlineArrowsExpand className="text-lg" />
                        </button>
                    ) : null}
                </div>
                {current.kind === 'image' && !zoom ? (
                    <span className="pointer-events-none absolute left-3 top-3 hidden rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-500 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 md:block">
                        Hover to zoom · click to enlarge
                    </span>
                ) : null}
            </div>

            <Dialog
                isOpen={viewerOpen}
                width={1100}
                onClose={() => setViewerOpen(false)}
                onRequestClose={() => setViewerOpen(false)}
            >
                <div className="flex flex-col gap-4 pt-6" onKeyDown={onKeyDown}>
                    <div
                        className="relative h-[min(70vh,44rem)] w-full overflow-hidden rounded-xl bg-gray-50"
                        {...swipe}
                    >
                        <div
                            className={classNames(
                                'h-full w-full',
                                current.kind === 'image' && 'p-4',
                            )}
                        >
                            {renderSlide(current, 'viewer')}
                        </div>
                        {count > 1 ? <Arrows onStep={step} /> : null}
                    </div>
                    {count > 1 ? (
                        <div className="flex justify-center">
                            <Thumbnails
                                media={slides}
                                index={index}
                                name={product.name}
                                onSelect={select}
                            />
                        </div>
                    ) : null}
                </div>
            </Dialog>
        </div>
    )
}

export default ProductGallery
