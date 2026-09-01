'use client'

import { createContext } from 'react'
import { themeConfig } from '@/configs/theme.config'
import type { Theme } from '@/@types/theme'

const ThemeContext = createContext<{
    theme: Theme
    setTheme: (fn: (param: Theme) => Theme | Theme) => void
}>({
    theme: themeConfig,
    setTheme: () => {},
})

export default ThemeContext
