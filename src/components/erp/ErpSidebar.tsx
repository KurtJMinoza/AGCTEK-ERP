'use client'

import Link from 'next/link'
import ScrollBar from '@/components/ui/ScrollBar'
import Logo from '@/components/template/Logo'
import classNames from '@/utils/classNames'
import useTheme from '@/utils/hooks/useTheme'
import appConfig from '@/configs/app.config'
import {
    HEADER_HEIGHT,
    LOGO_X_GUTTER,
    SIDE_NAV_COLLAPSED_WIDTH,
    SIDE_NAV_CONTENT_GUTTER,
    SIDE_NAV_WIDTH,
} from '@/constants/theme.constant'
import ErpSidebarContent from '@/components/erp/ErpSidebarContent'

const sideNavStyle = {
    width: SIDE_NAV_WIDTH,
    minWidth: SIDE_NAV_WIDTH,
}

const sideNavCollapseStyle = {
    width: SIDE_NAV_COLLAPSED_WIDTH,
    minWidth: SIDE_NAV_COLLAPSED_WIDTH,
}

export default function ErpSidebar() {
    const defaultMode = useTheme((state) => state.mode)
    const direction = useTheme((state) => state.direction)
    const sideNavCollapse = useTheme((state) => state.layout.sideNavCollapse)

    return (
        <div
            style={sideNavCollapse ? sideNavCollapseStyle : sideNavStyle}
            className={classNames(
                'side-nav side-nav-bg hidden lg:block',
                !sideNavCollapse && 'side-nav-expand',
            )}
        >
            <Link
                href={appConfig.authenticatedEntryPath}
                className="side-nav-header flex flex-col justify-center"
                style={{ height: HEADER_HEIGHT }}
            >
                <Logo
                    imgClass="max-h-10"
                    mode={defaultMode}
                    type={sideNavCollapse ? 'streamline' : 'full'}
                    className={classNames(
                        sideNavCollapse && 'ltr:ml-[11.5px] ltr:mr-[11.5px]',
                        sideNavCollapse
                            ? SIDE_NAV_CONTENT_GUTTER
                            : LOGO_X_GUTTER,
                    )}
                />
            </Link>

            <div
                className="side-nav-content"
                style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
            >
                <ScrollBar style={{ height: '100%' }} direction={direction}>
                    <ErpSidebarContent collapsed={sideNavCollapse} />
                </ScrollBar>
            </div>
        </div>
    )
}
