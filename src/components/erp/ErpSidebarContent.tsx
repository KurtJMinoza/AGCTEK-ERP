'use client'

import Link from 'next/link'
import { Fragment, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Menu from '@/components/ui/Menu'
import Tooltip from '@/components/ui/Tooltip'
import ErpIcon from '@/components/erp/ErpIcon'
import { getAllSubmodules, getResolvedErpModules } from '@/configs/erp-modules'
import { getActiveModuleCode } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import type { ErpModule, ErpSubmodule } from '@/types/erp-modules'

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
    const { can, loading } = usePermissions()
    const modules = useMemo(
        () =>
            loading
                ? []
                : getResolvedErpModules().filter((module) => can(module.code, 'view')),
        [can, loading],
    )
    const activeModuleCode = getActiveModuleCode(pathname)
    const activeKeys = activeModuleCode ? [activeModuleCode, pathname] : []

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
                            <Fragment key={module.code}>
                                <ModuleMenuItem
                                    module={module}
                                    collapsed={collapsed}
                                    onNavigate={onNavigate}
                                />
                                {sidebarShortcuts(module).map((shortcut) => (
                                    <ShortcutMenuItem
                                        key={shortcut.path}
                                        shortcut={shortcut}
                                        collapsed={collapsed}
                                        onNavigate={onNavigate}
                                    />
                                ))}
                            </Fragment>
                        ))}
                    </MenuGroup>
                </Menu>
            </div>
        </div>
    )
}

function sidebarShortcuts(module: ErpModule): ErpSubmodule[] {
    const codes = module.sidebarShortcuts ?? []
    return getAllSubmodules(module)
        .map(({ submodule }) => submodule)
        .filter((submodule) => codes.includes(submodule.code))
}

function ShortcutMenuItem({
    shortcut,
    collapsed,
    onNavigate,
}: {
    shortcut: ErpSubmodule
    collapsed: boolean
    onNavigate?: () => void
}) {
    return (
        <Tooltip title={shortcut.title} placement="right" disabled={!collapsed}>
            <MenuItem eventKey={shortcut.path}>
                <Link
                    href={shortcut.path}
                    onClick={onNavigate}
                    className={`flex h-full w-full items-center gap-2 ${collapsed ? '' : 'pl-6'}`}
                >
                    <ErpIcon icon={shortcut.icon} className="text-xl" />
                    {!collapsed ? (
                        <span className="truncate">{shortcut.title}</span>
                    ) : null}
                </Link>
            </MenuItem>
        </Tooltip>
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

    const linkClassName = 'flex h-full w-full items-center gap-2'
    const linkBody = (
        <>
            <ErpIcon icon={module.icon} />
            {!collapsed ? (
                <span className="truncate">{module.title}</span>
            ) : null}
        </>
    )

    const item = (
        <MenuItem eventKey={module.code}>
            {module.isExternalLink ? (
                <a
                    href={module.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                    className={linkClassName}
                >
                    {linkBody}
                </a>
            ) : (
                <Link
                    href={module.path}
                    onClick={onNavigate}
                    className={linkClassName}
                >
                    {linkBody}
                </Link>
            )}
        </MenuItem>
    )

    return (
        <Tooltip title={label} placement="right" disabled={!collapsed}>
            {item}
        </Tooltip>
    )
}
