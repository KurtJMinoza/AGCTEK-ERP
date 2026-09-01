'use client'

import { createContext } from 'react'
import type { NavigationTree } from '@/@types/navigation'

type Navigation = {
    navigationTree: NavigationTree[]
}

const NavigationContext = createContext<Navigation>({
    navigationTree: [],
})

export default NavigationContext
