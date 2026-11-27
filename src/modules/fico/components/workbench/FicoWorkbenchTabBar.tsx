'use client'

import type { ReactNode } from 'react'
import Tabs from '@/components/ui/Tabs'
import classNames from '@/utils/classNames'

export type FicoWorkbenchTab = {
    value: string
    label: string
}

type Props = {
    value: string
    onChange: (value: string) => void
    tabs: FicoWorkbenchTab[]
    actions?: ReactNode
    className?: string
}

export default function FicoWorkbenchTabBar({
    value,
    onChange,
    tabs,
    actions,
    className,
}: Props) {
    return (
        <div
            className={classNames(
                'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                className,
            )}
        >
            <Tabs value={value} onChange={onChange} variant="pill" className="min-w-0">
                <Tabs.TabList className="inline-flex max-w-full flex-wrap gap-1">
                    {tabs.map((tab) => (
                        <Tabs.TabNav key={tab.value} value={tab.value}>
                            {tab.label}
                        </Tabs.TabNav>
                    ))}
                </Tabs.TabList>
            </Tabs>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
    )
}