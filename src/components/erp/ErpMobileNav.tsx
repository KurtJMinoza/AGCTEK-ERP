'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Drawer from '@/components/ui/Drawer'
import Logo from '@/components/template/Logo'
import NavToggle from '@/components/shared/NavToggle'
import ErpSidebarContent from '@/components/erp/ErpSidebarContent'
import appConfig from '@/configs/app.config'
import { DIR_RTL } from '@/constants/theme.constant'
import withHeaderItem, { WithHeaderItemProps } from '@/utils/hoc/withHeaderItem'
import useTheme from '@/utils/hooks/useTheme'
import classNames from '@/utils/classNames'

type ErpMobileNavToggleProps = {
    toggled?: boolean
}

const ErpMobileNavToggle = withHeaderItem<
    ErpMobileNavToggleProps & WithHeaderItemProps
>(NavToggle)

export default function ErpMobileNav() {
    const [isOpen, setIsOpen] = useState(false)
    const direction = useTheme((state) => state.direction)
    const mode = useTheme((state) => state.mode)

    const handleClose = () => setIsOpen(false)

    return (
        <>
            <div
                className="block text-2xl lg:hidden"
                onClick={() => setIsOpen(true)}
                role="button"
            >
                <ErpMobileNavToggle toggled={isOpen} />
            </div>
            <Drawer
                title={
                    <Link
                        href={appConfig.authenticatedEntryPath}
                        className="inline-flex"
                        onClick={handleClose}
                    >
                        <Logo imgClass="max-h-10" type="full" mode={mode} />
                    </Link>
                }
                isOpen={isOpen}
                bodyClass={classNames('p-0')}
                width={330}
                placement={direction === DIR_RTL ? 'right' : 'left'}
                onClose={handleClose}
                onRequestClose={handleClose}
            >
                <Suspense fallback={null}>
                    {isOpen ? (
                        <ErpSidebarContent onNavigate={handleClose} />
                    ) : null}
                </Suspense>
            </Drawer>
        </>
    )
}
