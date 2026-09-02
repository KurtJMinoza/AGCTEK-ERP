'use client'

import Header from '@/components/template/Header'
import HeaderActions from '@/components/layouts/PostLoginLayout/components/HeaderActions'
import LayoutBase from '@/components//template/LayoutBase'
import ErpSidebar from '@/components/erp/ErpSidebar'
import ErpMobileNav from '@/components/erp/ErpMobileNav'
import SideNavToggle from '@/components/template/SideNavToggle'
import { LAYOUT_COLLAPSIBLE_SIDE } from '@/constants/theme.constant'
import type { CommonProps } from '@/@types/common'

const CollapsibleSide = ({ children }: CommonProps) => {
    return (
        <LayoutBase
            type={LAYOUT_COLLAPSIBLE_SIDE}
            className="app-layout-collapsible-side flex flex-auto flex-col"
        >
            <div className="flex min-w-0 flex-auto">
                <ErpSidebar />
                <div className="relative flex min-h-screen w-full min-w-0 flex-auto flex-col">
                    <Header
                        className="shadow-sm dark:shadow-2xl"
                        headerStart={
                            <>
                                <ErpMobileNav />
                                <SideNavToggle />
                            </>
                        }
                        headerEnd={<HeaderActions />}
                    />
                    <div className="flex flex-auto flex-col">{children}</div>
                </div>
            </div>
        </LayoutBase>
    )
}

export default CollapsibleSide
