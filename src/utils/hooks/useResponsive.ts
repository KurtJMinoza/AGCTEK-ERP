'use client'

import { useEffect, useState } from 'react'

const twBreakpoint: Record<'2xl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs', string> = {
    '2xl': '1536',
    xl: '1280',
    lg: '1024',
    md: '768',
    sm: '640',
    xs: '576',
}

const breakpointInt = (str = '') => {
    return parseInt(str.replace('px', ''))
}

const breakpoint = {
    '2xl': breakpointInt(twBreakpoint['2xl']), // 1536
    xl: breakpointInt(twBreakpoint.xl), // 1280
    lg: breakpointInt(twBreakpoint.lg), // 1024
    md: breakpointInt(twBreakpoint.md), // 768
    sm: breakpointInt(twBreakpoint.sm), // 640
    xs: breakpointInt(twBreakpoint.xs), // 576
}

/** SSR-safe defaults — never read `window` during the initial render. */
const defaultResponsiveState = {
    windowWidth: 0,
    larger: {
        lg: false,
        md: false,
        sm: false,
        xs: false,
        xl: false,
        '2xl': false,
    },
    smaller: {
        lg: false,
        md: false,
        sm: false,
        xs: false,
        xl: false,
        '2xl': false,
    },
}

const getAllSizes = (comparator = 'smaller') => {
    const currentWindowWidth = window.innerWidth
    return Object.fromEntries(
        Object.entries(breakpoint).map(([key, value]) => [
            key,
            comparator === 'larger'
                ? currentWindowWidth > value
                : currentWindowWidth < value,
        ]),
    )
}

const getResponsiveState = () => {
    const currentWindowWidth = window.innerWidth
    return {
        windowWidth: currentWindowWidth,
        larger: getAllSizes('larger') as typeof defaultResponsiveState.larger,
        smaller: getAllSizes('smaller') as typeof defaultResponsiveState.smaller,
    }
}

const useResponsive = () => {
    // Must match server HTML on the first client render to avoid useId drift
    // in Floating UI dropdowns further down the tree.
    const [responsive, setResponsive] = useState(defaultResponsiveState)

    useEffect(() => {
        const resizeHandler = () => {
            setResponsive(getResponsiveState())
        }

        resizeHandler()
        window.addEventListener('resize', resizeHandler)
        return () => window.removeEventListener('resize', resizeHandler)
    }, [])

    return responsive
}

export default useResponsive
