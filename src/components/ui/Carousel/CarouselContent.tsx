import { useEffect, useRef, type Ref, Children } from 'react'
import classNames from '../utils/classNames'
import { useCarousel } from './context'
import { useConfig } from '../ConfigProvider'
import type { CommonProps } from '../@types/common'

export interface CarouselContentProps extends CommonProps {
    ref?: Ref<HTMLDivElement>
}

const LOG_INTERVAL = 170

const CarouselContent = (props: CarouselContentProps) => {
    const { className, children, ref, ...rest } = props
    const {
        orientation,
        scrollPosition,
        setItemCount,
        setScrollInfo,
        containerRef,
        isDragging,
        setIsDragging,
        setDragOffset,
        scrollInfo,
        selectedIndex,
        scrollTo,
    } = useCarousel()
    const innerRef = useRef<HTMLDivElement>(null)

    const dragStartPosRef = useRef(0)
    const dragStartTimeRef = useRef(0)
    const lastPosRef = useRef(0)
    const lastTimeRef = useRef(0)

    useEffect(() => {
        const count = Children.count(children)
        setItemCount(count)
    }, [children, setItemCount])

    useEffect(() => {
        const calculateScrollInfo = () => {
            if (!innerRef.current || !containerRef.current) return

            const container = containerRef.current
            const content = innerRef.current
            const items = Array.from(content.children) as HTMLElement[]

            if (items.length === 0) return

            const containerSize =
                orientation === 'horizontal'
                    ? container.offsetWidth
                    : container.offsetHeight

            const itemPositions: number[] = []
            let totalSize = 0

            items.forEach((item) => {
                itemPositions.push(totalSize)
                totalSize +=
                    orientation === 'horizontal'
                        ? item.offsetWidth
                        : item.offsetHeight
            })

            const maxScroll = Math.max(0, totalSize - containerSize)

            if (maxScroll <= 0) {
                setScrollInfo({ snaps: [0], maxScroll: 0, itemPositions })
                return
            }

            const itemWidths = itemPositions.map((pos, i, arr) =>
                i === arr.length - 1 ? totalSize - pos : arr[i + 1] - pos,
            )
            const minItemWidth = Math.min(...itemWidths)

            const boundedSnaps = itemPositions.map((snap) =>
                Math.max(0, Math.min(maxScroll, snap)),
            )

            const SNAP_TOLERANCE = minItemWidth * 0.5
            const snaps: number[] = []
            for (const snap of boundedSnaps) {
                const lastSnap = snaps[snaps.length - 1]
                if (snaps.length === 0 || snap - lastSnap > SNAP_TOLERANCE) {
                    snaps.push(snap)
                }
            }

            if (snaps.length === 0) {
                snaps.push(0)
            }

            setScrollInfo({ snaps, maxScroll, itemPositions })
        }

        const rafId = requestAnimationFrame(calculateScrollInfo)

        const resizeObserver = new ResizeObserver(calculateScrollInfo)
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current)
        }
        if (innerRef.current) {
            resizeObserver.observe(innerRef.current)
        }

        return () => {
            cancelAnimationFrame(rafId)
            resizeObserver.disconnect()
        }
    }, [children, setScrollInfo, orientation, containerRef])

    const getPointerPos = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e && e.touches[0]) {
            return orientation === 'horizontal'
                ? e.touches[0].clientX
                : e.touches[0].clientY
        }
        if ('changedTouches' in e && e.changedTouches[0]) {
            return orientation === 'horizontal'
                ? e.changedTouches[0].clientX
                : e.changedTouches[0].clientY
        }
        return orientation === 'horizontal'
            ? (e as React.MouseEvent).clientX
            : (e as React.MouseEvent).clientY
    }

    const { direction } = useConfig()

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if ((e.target as HTMLElement).closest('button')) return

        const pos = getPointerPos(e)
        const now = Date.now()

        setIsDragging(true)
        setDragOffset(0)
        dragStartPosRef.current = pos
        dragStartTimeRef.current = now
        lastPosRef.current = pos
        lastTimeRef.current = now
    }

    const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return

        const pos = getPointerPos(e)
        const now = Date.now()
        let delta = pos - dragStartPosRef.current

        if (direction === 'rtl' && orientation === 'horizontal') {
            delta = -delta
        }

        if (now - dragStartTimeRef.current > LOG_INTERVAL) {
            dragStartPosRef.current = lastPosRef.current
            dragStartTimeRef.current = lastTimeRef.current
        }

        lastPosRef.current = pos
        lastTimeRef.current = now
        setDragOffset(delta)
    }

    const handleDragEnd = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return

        const endPos = getPointerPos(e)
        const endTime = Date.now()
        let totalDelta = endPos - dragStartPosRef.current

        if (direction === 'rtl' && orientation === 'horizontal') {
            totalDelta = -totalDelta
        }

        const totalTime = endTime - dragStartTimeRef.current
        const timeSinceLastMove = endTime - lastTimeRef.current

        setIsDragging(false)
        setDragOffset(0)

        const { snaps } = scrollInfo
        const currentSnap = snaps[selectedIndex] ?? 0

        const expired = timeSinceLastMove > LOG_INTERVAL
        const velocity = totalTime > 0 ? totalDelta / totalTime : 0
        const isFlick = totalTime > 0 && !expired && Math.abs(velocity) > 0.1

        const containerSize = containerRef.current
            ? orientation === 'horizontal'
                ? containerRef.current.offsetWidth
                : containerRef.current.offsetHeight
            : 300

        const goToNextThreshold = Math.min(
            225,
            Math.max(50, containerSize * 0.2),
        )

        const forceBoost = 300
        const rawForce = isFlick ? velocity * forceBoost : 0
        const force = totalDelta + rawForce

        // Determine direction
        const dir = Math.sign(force)

        let targetIndex = selectedIndex

        if (Math.abs(force) < goToNextThreshold) {
            const projectedScroll = currentSnap - force
            let minDist = Infinity
            for (let i = 0; i < snaps.length; i++) {
                const dist = Math.abs(snaps[i] - projectedScroll)
                if (dist < minDist) {
                    minDist = dist
                    targetIndex = i
                }
            }
        } else {
            if (dir > 0) {
                targetIndex = selectedIndex - 1
            } else {
                targetIndex = selectedIndex + 1
            }
        }

        scrollTo(targetIndex)
    }

    const handleMouseLeave = (e: React.MouseEvent) => {
        if (isDragging) handleDragEnd(e)
    }

    const getTransform = () => {
        const offset = -scrollPosition
        if (orientation === 'horizontal') {
            const translate = direction === 'rtl' ? -offset : offset
            return `translateX(${translate}px)`
        }
        return `translateY(${offset}px)`
    }

    const contentClass = classNames(
        'flex',
        orientation === 'horizontal' ? '' : 'flex-col',
        className,
    )

    const transitionStyle = isDragging
        ? 'none'
        : 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)'

    return (
        <div
            ref={containerRef}
            className="overflow-hidden select-none"
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleDragStart}
            onTouchMove={handleDragMove}
            onTouchEnd={handleDragEnd}
        >
            <div
                ref={(node) => {
                    innerRef.current = node
                    if (typeof ref === 'function') {
                        ref(node)
                    } else if (ref && 'current' in ref) {
                        ref.current = node
                    }
                }}
                className={contentClass}
                style={{
                    transform: getTransform(),
                    transition: transitionStyle,
                }}
                {...rest}
            >
                {children}
            </div>
        </div>
    )
}

export default CarouselContent
