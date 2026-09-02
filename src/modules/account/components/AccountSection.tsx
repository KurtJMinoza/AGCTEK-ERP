'use client'

import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'

type AccountSectionProps = {
    title: string
    description?: string
    children: ReactNode
    footer?: ReactNode
    className?: string
}

const AccountSection = ({
    title,
    description,
    children,
    footer,
    className,
}: AccountSectionProps) => {
    return (
        <section className={classNames('flex h-full flex-col', className)}>
            <div>
                <h3 className="text-xl font-bold heading-text">{title}</h3>
                {description ? (
                    <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
                ) : null}
            </div>

            <div className="mt-8 flex-1">{children}</div>

            {footer ? (
                <div className="mt-8 flex justify-end">{footer}</div>
            ) : null}
        </section>
    )
}

export default AccountSection
