import { useState, useCallback, useRef, useEffect } from 'react'
import classNames from '../utils/classNames'
import { CarouselContextProvider } from './context'
import { useConfig } from '../ConfigProvider'
import type { KeyboardEvent, Ref } from 'react'
import type { CarouselOrientation, CarouselApi, ScrollInfo } from './context'
import type { CommonProps } from '../@types/common'

export interface CarouselProps extends CommonProps {
    orientation?: CarouselOrientation
    opts?: {
        align?: 'start' | 'center' | 'end'
        loop?: boolean
        dragFree?: boolean
        skipSnaps?: boolean
        startIndex?: number
    }
    setApi?: (api: CarouselApi) => void
    ref?: Ref<HTMLDivElement>
}

const Carousel = (props: CarouselProps) => {
    const {
        orientation = 'horizontal',
        opts = {},
        setApi,
        className,
        children,
        ref,
        ...rest
    } = props

    const { loop = false, startIndex = 0 } = opts

    const containerRef = useRef<HTMLDivElement>(null)
    const [selectedIndex, setSelectedIndex] = useState(startIndex)
    const [itemCount, setItemCount] = useState(0)
    const [scrollInfo, setScrollInfo] = useState<ScrollInfo>({
        snaps: [0],
        maxScroll: 0,
        itemPositions: [],
    })

    const [isDragging, setIsDragging] = useState(false)
    const [dragOffset, setDragOffset] = useState(0)

    const { snaps, maxScroll } = scrollInfo
    const snapCount = snaps.length

    const currentSnap = snaps[selectedIndex] ?? 0

    let scrollPos = currentSnap - dragOffset

    if (isDragging && !loop) {
        if (scrollPos < 0) {
            const overscroll = -scrollPos
            scrollPos = -Math.pow(overscroll, 0.6) * 0.4
        } else if (scrollPos > maxScroll) {
            const overscroll = scrollPos - maxScroll
            scrollPos = maxScroll + Math.pow(overscroll, 0.6) * 0.4
        }
    } else if (!isDragging) {
        scrollPos = Math.max(0, Math.min(maxScroll, scrollPos))
    }

    const scrollPosition = scrollPos

    const canScrollPrev = loop ? snapCount > 1 : selectedIndex > 0
    const canScrollNext = loop ? snapCount > 1 : selectedIndex < snapCount - 1

    const scrollTo = useCallback(
        (index: number) => {
            const maxIndex = snapCount - 1
            let newIndex = index
            if (loop) {
                if (index < 0) newIndex = maxIndex
                else if (index > maxIndex) newIndex = 0
            } else {
                newIndex = Math.max(0, Math.min(index, maxIndex))
            }
            setSelectedIndex(newIndex)
        },
        [snapCount, loop],
    )

    const scrollPrev = useCallback(() => {
        if (canScrollPrev) scrollTo(selectedIndex - 1)
    }, [canScrollPrev, selectedIndex, scrollTo])

    const scrollNext = useCallback(() => {
        if (canScrollNext) scrollTo(selectedIndex + 1)
    }, [canScrollNext, selectedIndex, scrollTo])

    useEffect(() => {
        if (setApi) {
            setApi({
                scrollPrev,
                scrollNext,
                canScrollPrev,
                canScrollNext,
                selectedIndex,
                scrollTo,
                scrollSnapCount: snapCount,
            })
        }
    }, [
        setApi,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
        selectedIndex,
        scrollTo,
        snapCount,
    ])

    const { direction } = useConfig()

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            const isHorizontal = orientation === 'horizontal'
            const isRtl = direction === 'rtl'

            if (
                (isHorizontal && event.key === 'ArrowLeft') ||
                (!isHorizontal && event.key === 'ArrowUp')
            ) {
                event.preventDefault()
                if (isRtl && isHorizontal) {
                    scrollNext()
                } else {
                    scrollPrev()
                }
            } else if (
                (isHorizontal && event.key === 'ArrowRight') ||
                (!isHorizontal && event.key === 'ArrowDown')
            ) {
                event.preventDefault()
                if (isRtl && isHorizontal) {
                    scrollPrev()
                } else {
                    scrollNext()
                }
            }
        },
        [orientation, scrollPrev, scrollNext, direction],
    )

    return (
        <CarouselContextProvider
            value={{
                orientation,
                scrollPrev,
                scrollNext,
                canScrollPrev,
                canScrollNext,
                selectedIndex,
                scrollTo,
                scrollPosition,
                itemCount,
                setItemCount,
                scrollInfo,
                setScrollInfo,
                containerRef,
                isDragging,
                setIsDragging,
                setDragOffset,
                loop,
            }}
        >
            <div
                ref={ref}
                className={classNames('relative', className)}
                role="region"
                aria-roledescription="carousel"
                tabIndex={0}
                onKeyDownCapture={handleKeyDown}
                {...rest}
            >
                {children}
            </div>
        </CarouselContextProvider>
    )
}

export default Carousel
