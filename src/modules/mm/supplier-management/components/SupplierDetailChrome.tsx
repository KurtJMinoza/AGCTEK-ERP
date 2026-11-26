'use client'

import type { CSSProperties, ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import classNames from '@/utils/classNames'

/** Animated tab body — fades/slides in on mount (respects reduced motion). */
export function SupplierTabPanel({
    active,
    panelKey,
    children,
    className,
}: {
    active: boolean
    panelKey?: string
    children: ReactNode
    className?: string
}) {
    if (!active) return null
    return (
        <div
            key={panelKey ?? 'panel'}
            className={classNames(
                'animate-mm-row-in motion-reduce:animate-none',
                className,
            )}
        >
            {children}
        </div>
    )
}

export function SupplierSectionCard({
    title,
    description,
    icon,
    children,
    className,
    delayMs = 0,
}: {
    title: string
    description?: string
    icon?: ReactNode
    children: ReactNode
    className?: string
    delayMs?: number
}) {
    return (
        <div
            className={classNames(
                'rounded-xl border border-gray-100 bg-gray-50/80 p-4 transition-shadow duration-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-800/30',
                'animate-mm-row-in motion-reduce:animate-none',
                className,
            )}
            style={
                delayMs
                    ? ({ animationDelay: `${delayMs}ms` } as CSSProperties)
                    : undefined
            }
        >
            <div className="mb-3 flex items-start gap-3">
                {icon ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm dark:bg-gray-900">
                        {icon}
                    </span>
                ) : null}
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </h3>
                    {description ? (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {children}
        </div>
    )
}

export function SupplierTabToolbar({
    title,
    description,
    actions,
}: {
    title: string
    description?: ReactNode
    actions?: ReactNode
}) {
    return (
        <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
            <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                </h3>
                {description ? (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {description}
                    </div>
                ) : null}
            </div>
            {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    )
}

export function SupplierComingSoonPanel({
    name,
    icon,
    blurb,
}: {
    name: string
    icon: ReactNode
    blurb: string
}) {
    return (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50/80 to-white px-6 py-10 text-center dark:border-gray-700 dark:from-gray-900/40 dark:to-gray-950">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-subtle text-primary-deep shadow-sm animate-mm-icon-pop motion-reduce:animate-none dark:bg-primary/15 dark:text-primary-light">
                {icon}
            </span>
            <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {name}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {blurb}
                </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                Coming soon
            </span>
        </div>
    )
}

export function SupplierDetailSummaryStrip({
    children,
}: {
    children: ReactNode
}) {
    return (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {children}
        </div>
    )
}

export function SupplierWorkbenchShell({
    tabList,
    children,
}: {
    tabList: ReactNode
    children: ReactNode
}) {
    return (
        <AdaptiveCard className="mt-4 overflow-hidden border-gray-100 shadow-sm dark:border-gray-800">
            <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/90 via-white to-primary-subtle/30 px-2 pt-2 dark:border-gray-800 dark:from-gray-900/60 dark:via-gray-900 dark:to-primary/10">
                {tabList}
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </AdaptiveCard>
    )
}
