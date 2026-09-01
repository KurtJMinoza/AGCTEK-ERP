import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

type PageHeaderProps = {
    title: ReactNode
    description?: ReactNode
    actions?: ReactNode
    className?: string
}

const PageHeader = ({
    title,
    description,
    actions,
    className,
}: PageHeaderProps) => {
    return (
        <div
            className={classNames(
                'mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
                className,
            )}
        >
            <div className="min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {title}
                </h2>
                {description ? (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {description}
                    </p>
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

export default PageHeader
