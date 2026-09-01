'use client'

import { LayoutContext } from '@/utils/hooks/useLayout'
import type { LayoutContextProps } from '@/utils/hooks/useLayout'
import type { CommonProps } from '@/@types/common'

type LayoutBaseProps = CommonProps & LayoutContextProps

const LayoutBase = (props: LayoutBaseProps) => {
    const {
        children,
        className,
        adaptiveCardActive,
        type,
        pageContainerReassemble,
    } = props

    const contextValue = { adaptiveCardActive, pageContainerReassemble, type }

    return (
        <LayoutContext.Provider value={contextValue}>
            <div className={className}>{children}</div>
        </LayoutContext.Provider>
    )
}

export default LayoutBase
