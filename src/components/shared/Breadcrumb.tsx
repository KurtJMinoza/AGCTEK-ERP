import Link from 'next/link'
import { HiChevronRight } from 'react-icons/hi'
import classNames from '@/utils/classNames'

export type BreadcrumbItem = {
    label: string
    href?: string
}

type BreadcrumbProps = {
    items: BreadcrumbItem[]
    className?: string
}

const Breadcrumb = ({ items, className }: BreadcrumbProps) => {
    if (items.length === 0) {
        return null
    }

    return (
        <nav aria-label="Breadcrumb" className={classNames('mb-4', className)}>
            <ol className="flex flex-wrap items-center gap-1 text-sm">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1

                    return (
                        <li
                            key={`${item.label}-${index}`}
                            className="flex min-w-0 items-center gap-1"
                        >
                            {index > 0 ? (
                                <HiChevronRight
                                    className="shrink-0 text-gray-400 dark:text-gray-500"
                                    aria-hidden
                                />
                            ) : null}
                            {item.href && !isLast ? (
                                <Link
                                    href={item.href}
                                    className="truncate text-primary hover:underline"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    className={classNames(
                                        'truncate',
                                        isLast
                                            ? 'font-medium text-gray-700 dark:text-gray-200'
                                            : 'text-gray-500 dark:text-gray-400',
                                    )}
                                    aria-current={isLast ? 'page' : undefined}
                                >
                                    {item.label}
                                </span>
                            )}
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

export default Breadcrumb
