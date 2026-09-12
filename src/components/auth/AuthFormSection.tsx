'use client'

import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'

type AuthFormSectionProps = {
    title: string
    description?: string
    children: ReactNode
    className?: string
}

const AuthFormSection = ({
    title,
    description,
    children,
    className,
}: AuthFormSectionProps) => {
    return (
        <section className={classNames('space-y-4', className)}>
            <div className="border-b border-gray-200 pb-3 dark:border-gray-700">
                <h3 className="text-sm font-semibold heading-text">{title}</h3>
                {description ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
                ) : null}
            </div>
            <div className="space-y-1">{children}</div>
        </section>
    )
}

export default AuthFormSection
