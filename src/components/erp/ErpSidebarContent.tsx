'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Menu from '@/components/ui/Menu'
import Tooltip from '@/components/ui/Tooltip'
import ErpIcon from '@/components/erp/ErpIcon'
import { getResolvedErpModules } from '@/configs/erp-modules'
import { getActiveModuleCode } from '@/utils/erp-navigation'
import type { ErpModule } from '@/types/erp-modules'

const { MenuItem, MenuGroup } = Menu

type ErpSidebarContentProps = {
    collapsed?: boolean
    onNavigate?: () => void
}

export default function ErpSidebarContent({
    collapsed = false,
    onNavigate,
}: ErpSidebarContentProps) {
    const pathname = usePathname()
    const modules = useMemo(() => getResolvedErpModules(), [])
    const activeModuleCode = getActiveModuleCode(pathname)
    const activeKeys = activeModuleCode ? [activeModuleCode] : []

    return (
        <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto py-2">
                <Menu
                    sideCollapsed={collapsed}
                    defaultActiveKeys={activeKeys}
                    className="px-1"
                >
                    <MenuGroup label="Modules">
                        {modules.map((module) => (
                            <ModuleMenuItem
                                key={module.code}
                                module={module}
                                collapsed={collapsed}
                                onNavigate={onNavigate}
                            />
                        ))}
                    </MenuGroup>
                </Menu>
            </div>
        </div>
    )
}

function ModuleMenuItem({
    module,
    collapsed,
    onNavigate,
}: {
    module: ErpModule
    collapsed: boolean
    onNavigate?: () => void
}) {
    const label = module.title

    const item = (
        <MenuItem eventKey={module.code}>
            <Link
                href={module.path}
                onClick={onNavigate}
                className="flex h-full w-full items-center gap-2"
            >
                <ErpIcon icon={module.icon} />
                {!collapsed ? (
                    <span className="truncate">{module.title}</span>
                ) : null}
            </Link>
        </MenuItem>
    )

    if (collapsed) {
        return (
            <Tooltip title={label} placement="right">
                {item}
            </Tooltip>
        )
    }

    return item
}
