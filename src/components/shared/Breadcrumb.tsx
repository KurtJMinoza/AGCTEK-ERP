import Link from 'next/link'
import { HiChevronRight } from 'react-icons/hi'
import classNames from '@/utils/classNames'
import type { ReactNode } from 'react'

export type BreadcrumbItem = {
    label: ReactNode
    href?: string
}

type BreadcrumbProps = {
    items: BreadcrumbItem[]
    className?: string
}

const Breadcrumb = ({ items, className }: BreadcrumbProps) => {
    if (!items.length) return null

    return (
        <nav aria-label="Breadcrumb" className={classNames(className)}>
            <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1

                    return (
                        <li
                            key={`${index}-${typeof item.label === 'string' ? item.label : 'crumb'}`}
                            className="flex items-center gap-1"
                        >
                            {index > 0 ? (
                                <HiChevronRight
                                    className="shrink-0 text-base text-gray-400 dark:text-gray-500"
                                    aria-hidden
                                />
                            ) : null}
                            {item.href && !isLast ? (
                                <Link
                                    href={item.href}
                                    className="truncate hover:text-primary hover:underline"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    className={classNames(
                                        'truncate',
                                        isLast &&
                                            'font-medium text-gray-700 dark:text-gray-200',
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
