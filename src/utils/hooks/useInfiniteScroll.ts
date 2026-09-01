'use client'

import { Ref, useEffect, useRef, useState } from 'react'

type Options = {
    offset?: string
    shouldStop?: boolean
    onLoadMore?: () => Promise<void>
}

function useInfiniteScroll(options?: Options) {
    const { offset = '0px', shouldStop = false, onLoadMore } = options ?? {}

    const [isLoading, setIsLoading] = useState(false)
    const observerRef = useRef<IntersectionObserver>(undefined)
    const targetRef = useRef(
        typeof window !== 'undefined' ? document.createElement('div') : null,
    )

    const containerRef: Ref<HTMLElement> = (container) => {
        if (container && targetRef.current) {
            container.append(targetRef.current)
            container.style.position = 'relative'
        }
    }

    useEffect(() => {
        if (targetRef.current) {
            const target = targetRef.current
            target.toggleAttribute('data-infinite-scroll-detector', true)
            target.style.position = 'absolute'
            target.style.bottom = offset
            if (target.offsetTop < 0) target.style.bottom = '0px'
        }
    }, [offset, isLoading])

    useEffect(() => {
        const observe = observerRef.current
        if (observe) {
            observe.disconnect()
        }

        async function handler([
            { isIntersecting },
        ]: IntersectionObserverEntry[]) {
            if (
                isIntersecting &&
                !isLoading &&
                !shouldStop &&
                typeof onLoadMore === 'function'
            ) {
                setIsLoading(true)
                await onLoadMore()
                setIsLoading(false)
            }
        }

        observerRef.current = new IntersectionObserver(
            handler as IntersectionObserverCallback,
            { threshold: 0 },
        )

        if (targetRef.current) {
            observerRef.current.observe(targetRef.current)
        }

        return () => observe?.disconnect()
    }, [isLoading, onLoadMore, shouldStop])

    return {
        isLoading,
        containerRef,
    }
}

export default useInfiniteScroll
