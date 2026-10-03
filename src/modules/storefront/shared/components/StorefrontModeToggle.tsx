'use client'

import { HiOutlineMoon, HiOutlineSun } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import useTheme from '@/utils/hooks/useTheme'
import { MODE_DARK, MODE_LIGHT } from '@/constants/theme.constant'

/** Light/dark switch for storefront headers; uses the app theme so the choice persists. */
const StorefrontModeToggle = ({ className }: { className?: string }) => {
    const mode = useTheme((state) => state.mode)
    const setMode = useTheme((state) => state.setMode)

    const isDark = mode === MODE_DARK
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

    return (
        <Button
            size="sm"
            shape="circle"
            variant="plain"
            className={className}
            icon={isDark ? <HiOutlineSun className="text-xl" /> : <HiOutlineMoon className="text-xl" />}
            aria-label={label}
            title={label}
            onClick={() => setMode(isDark ? MODE_LIGHT : MODE_DARK)}
        />
    )
}

export default StorefrontModeToggle
