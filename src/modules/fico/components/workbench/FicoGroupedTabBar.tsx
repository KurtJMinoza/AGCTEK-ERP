'use client'

import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'

export type FicoTabItem = { value: string; label: string }

export type FicoTabGroup = {
    label: string
    tabs: FicoTabItem[]
}

type Props = {
    value: string
    onChange: (value: string) => void
    groups: FicoTabGroup[]
    actions?: ReactNode
    className?: string
}

/** Horizontal grouped tabs — avoids awkward two-row wraps on wide AP workbenches. */
export default function FicoGroupedTabBar({
    value,
    onChange,
    groups,
    actions,
    className,
}: Props) {
    return (
        <div
            className={classNames(
                'flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between',
                className,
            )}
        >
            <div className="min-w-0 flex-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
                <div className="flex min-w-max gap-6 pr-2">
                    {groups.map((group) => (
                        <div key={group.label} className="shrink-0">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                {group.label}
                            </p>
                            <div
                                className="inline-flex flex-wrap gap-1 rounded-lg bg-gray-50/80 p-1 dark:bg-gray-900/50"
                                role="tablist"
                            >
                                {group.tabs.map((tab) => {
                                    const active = tab.value === value
                                    return (
                                        <button
                                            key={tab.value}
                                            type="button"
                                            role="tab"
                                            aria-selected={active}
                                            onClick={() => onChange(tab.value)}
                                            className={classNames(
                                                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                                                active
                                                    ? 'bg-white text-primary shadow-sm dark:bg-gray-800 dark:text-primary-light'
                                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
    )
}