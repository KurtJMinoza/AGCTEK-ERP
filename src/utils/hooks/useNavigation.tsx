'use client'

import { useContext } from 'react'
import NavigationContext from '@/components/template/Navigation/NavigationContext'

const useNavigation = () => {
    const context = useContext(NavigationContext)

    if (context === undefined) {
        throw new Error('useNavigation must be used under a NavigationProvider')
    }

    return context
}

export default useNavigation
