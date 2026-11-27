'use client'

import type { ReactNode } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Alert from '@/components/ui/Alert'
import classNames from '@/utils/classNames'

export function FicoWorkbenchPanel({
    children,
    className,
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <AdaptiveCard className={classNames('mt-4', className)} bodyClass="p-4 sm:p-5">
            {children}
        </AdaptiveCard>
    )
}

export function FicoWorkbenchAlert({
    message,
    onDismiss,
}: {
    message: string
    onDismiss?: () => void
}) {
    if (!message) return null
    return (
        <Alert
            showIcon
            className="mb-4"
            type="danger"
            closable={Boolean(onDismiss)}
            onClose={onDismiss}
        >
            {message}
        </Alert>
    )
}

export function FicoCompanyRequired({
    message = 'Select a company to load this workbench.',
}: {
    message?: string
}) {
    return (
        <AdaptiveCard className="mt-4" bodyClass="py-12 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </AdaptiveCard>
    )
}

export function FicoTableToolbar({
    title,
    description,
    children,
}: {
    title?: string
    description?: string
    children?: ReactNode
}) {
    return (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {title ? (
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {title}
                    </h3>
                ) : null}
                {description ? (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
                ) : null}
            </div>
            {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
        </div>
    )
}