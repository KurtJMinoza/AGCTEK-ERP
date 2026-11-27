'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Segment from '@/components/ui/Segment'
import classNames from '@/utils/classNames'
import type { FicoTabGroup } from './FicoGroupedTabBar'

type Props = {
    value: string
    onChange: (value: string) => void
    groups: FicoTabGroup[]
    actions?: ReactNode
    className?: string
}

function groupForTab(groups: FicoTabGroup[], tabValue: string) {
    return groups.find((g) => g.tabs.some((t) => t.value === tabValue))?.label ?? groups[0]?.label
}

export default function FicoResponsiveGroupedTabBar({
    value,
    onChange,
    groups,
    actions,
    className,
}: Props) {
    const [groupKey, setGroupKey] = useState(() => groupForTab(groups, value))

    useEffect(() => {
        setGroupKey(groupForTab(groups, value))
    }, [groups, value])

    const activeGroup = useMemo(
        () => groups.find((g) => g.label === groupKey) ?? groups[0],
        [groups, groupKey],
    )

    const tabOptions = useMemo(
        () =>
            activeGroup?.tabs.map((t) => ({
                value: t.value,
                label: t.label,
            })) ?? [],
        [activeGroup],
    )

    const onGroupChange = (next: string) => {
        setGroupKey(next)
        const group = groups.find((g) => g.label === next)
        if (!group?.tabs.length) return
        const stillInGroup = group.tabs.some((t) => t.value === value)
        if (!stillInGroup) {
            onChange(group.tabs[0].value)
        }
    }

    return (
        <div
            className={classNames(
                'flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-800',
                className,
            )}
        >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <Segment
                        className="w-full shrink-0 sm:w-auto"
                        value={groupKey}
                        onChange={(v) => onGroupChange(String(v))}
                    >
                        {groups.map((g) => (
                            <Segment.Item key={g.label} value={g.label}>
                                {g.label}
                            </Segment.Item>
                        ))}
                    </Segment>

                    {/* Mobile / narrow: compact tab picker */}
                    <div className="w-full sm:hidden">
                        <Select
                            size="sm"
                            isSearchable={false}
                            options={tabOptions}
                            value={tabOptions.find((o) => o.value === value) ?? null}
                            onChange={(opt) => onChange(opt?.value ?? value)}
                        />
                    </div>

                    {/* Tablet+ : scrollable pill tabs for active group only */}
                    <div className="hidden min-w-0 flex-1 sm:block">
                        <Tabs
                            value={value}
                            onChange={onChange}
                            variant="pill"
                            className="min-w-0"
                        >
                            <Tabs.TabList
                                className={classNames(
                                    'inline-flex max-w-full gap-1 overflow-x-auto pb-0.5',
                                    '[-ms-overflow-style:none] [scrollbar-width:thin]',
                                    '[&::-webkit-scrollbar]:h-1',
                                )}
                            >
                                {activeGroup?.tabs.map((tab) => (
                                    <Tabs.TabNav
                                        key={tab.value}
                                        value={tab.value}
                                        className="shrink-0 whitespace-nowrap"
                                    >
                                        {tab.label}
                                    </Tabs.TabNav>
                                ))}
                            </Tabs.TabList>
                        </Tabs>
                    </div>
                </div>

                {actions ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                        {actions}
                    </div>
                ) : null}
            </div>
        </div>
    )
}