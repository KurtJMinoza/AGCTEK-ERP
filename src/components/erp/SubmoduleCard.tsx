'use client'

import Link from 'next/link'
import { HiChevronRight } from 'react-icons/hi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import ErpIcon from '@/components/erp/ErpIcon'
import type { ErpSubmodule } from '@/types/erp-modules'
import classNames from '@/utils/classNames'

type SubmoduleCardProps = {
    submodule: ErpSubmodule
    className?: string
}

export default function SubmoduleCard({
    submodule,
    className,
}: SubmoduleCardProps) {
    return (
        <Link
            href={submodule.path}
            className={classNames('group block', className)}
        >
            <AdaptiveCard clickable className="h-full">
                <div className="flex items-start justify-between gap-3">
                    <IconText
                        className="items-start gap-3"
                        icon={
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                                <ErpIcon icon={submodule.icon} />
                            </span>
                        }
                    >
                        <div>
                            <h4 className="font-semibold heading-text">
                                {submodule.title}
                            </h4>
                            <p className="mt-2 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                                {submodule.description}
                            </p>
                        </div>
                    </IconText>
                    <HiChevronRight className="mt-1 shrink-0 text-lg text-gray-400 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </div>
            </AdaptiveCard>
        </Link>
    )
}
