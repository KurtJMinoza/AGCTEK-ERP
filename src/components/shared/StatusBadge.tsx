import Tag from '@/components/ui/Tag'
import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

export type StatusTone =
    | 'default'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'

type StatusBadgeProps = {
    children: ReactNode
    tone?: StatusTone
    className?: string
    prefix?: ReactNode
}

const toneClass: Record<StatusTone, string> = {
    default: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
}

const StatusBadge = ({
    children,
    tone = 'default',
    className,
    prefix,
}: StatusBadgeProps) => {
    return (
        <Tag
            className={classNames(
                'border-0 font-semibold',
                toneClass[tone],
                className,
            )}
            prefix={prefix}
        >
            {children}
        </Tag>
    )
}

export default StatusBadge
