'use client'

import { useState } from 'react'
import classNames from 'classnames'
import Drawer from '@/components/ui/Drawer'
import { PiGearDuotone } from 'react-icons/pi'
import SidePanelContent from './SidePanelContent'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import useTheme from '@/utils/hooks/useTheme'
import type { CommonProps } from '@/@types/common'

type SidePanelProps = CommonProps

const _SidePanel = (props: SidePanelProps) => {
    const { className, ...rest } = props

    const [isOpen, setIsOpen] = useState(false)

    const direction = useTheme((state) => state.direction)

    const openPanel = () => {
        setIsOpen(true)
    }

    const closePanel = () => {
        setIsOpen(false)

        if (document) {
            const bodyClassList = document.body.classList
            if (bodyClassList.contains('drawer-lock-scroll')) {
                bodyClassList.remove('drawer-lock-scroll', 'drawer-open')
            }
        }
    }

    return (
        <>
            <div
                className={classNames('text-2xl', className)}
                onClick={openPanel}
                {...rest}
            >
                <PiGearDuotone />
            </div>
            <Drawer
                title="Theme Config"
                isOpen={isOpen}
                placement={direction === 'rtl' ? 'left' : 'right'}
                width={375}
                onClose={closePanel}
                onRequestClose={closePanel}
            >
                <SidePanelContent />
            </Drawer>
        </>
    )
}

const SidePanel = withHeaderItem(_SidePanel)

export default SidePanel
