'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'

export type StatCardTone = 'default' | 'success' | 'info' | 'warning' | 'danger'

const toneClasses: Record<StatCardTone, { icon: string; text: string }> = {
    default: {
        icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    success: {
        icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    info: {
        icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    warning: {
        icon: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    danger: {
        icon: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
}

export type StatCardProps = {
    label: string
    value: ReactNode
    icon: ReactNode
    tone?: StatCardTone
    href?: string
    loading?: boolean
    className?: string
    size?: 'default' | 'lg'
    badge?: { tone: StatCardTone; label: string }
}

const StatCard = ({
    label,
    value,
    icon,
    tone = 'default',
    href,
    loading,
    className,
    size = 'default',
    badge,
}: StatCardProps) => {
    const card = (
        <AdaptiveCard
            className={classNames(
                'group h-full transition-all',
                href && 'hover:border-primary/30 hover:shadow-sm',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                    {loading ? (
                        <div
                            className={classNames(
                                'animate-pulse rounded bg-gray-200 dark:bg-gray-700',
                                size === 'lg' ? 'mt-2 h-9 w-32' : 'mt-2 h-8 w-24',
                            )}
                        />
                    ) : (
                        <p
                            className={classNames(
                                'mt-1 font-bold tabular-nums heading-text',
                                size === 'lg' ? 'text-3xl' : 'text-2xl',
                                toneClasses[tone].text,
                            )}
                        >
                            {value}
                        </p>
                    )}
                    {!loading && badge && (
                        <StatusBadge tone={badge.tone} className="mt-2">
                            {badge.label}
                        </StatusBadge>
                    )}
                </div>
                <span
                    className={classNames(
                        'flex shrink-0 items-center justify-center rounded-xl',
                        toneClasses[tone].icon,
                        size === 'lg' ? 'h-12 w-12 text-xl' : 'h-11 w-11 text-lg',
                    )}
                >
                    {icon}
                </span>
            </div>
        </AdaptiveCard>
    )

    if (href) {
        return (
            <Link href={href} className="block h-full">
                {card}
            </Link>
        )
    }

    return card
}

export default StatCard
