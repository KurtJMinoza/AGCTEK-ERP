'use client'

import NavigationContext from './NavigationContext'

import type { NavigationTree } from '@/@types/navigation'
import type { CommonProps } from '@/@types/common'

interface NavigationProviderProps extends CommonProps {
    navigationTree: NavigationTree[]
}

const NavigationProvider = ({
    navigationTree,
    children,
}: NavigationProviderProps) => {
    return (
        <NavigationContext.Provider value={{ navigationTree }}>
            {children}
        </NavigationContext.Provider>
    )
}

export default NavigationProvider
