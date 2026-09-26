'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import ErpIcon from '@/components/erp/ErpIcon'
import type { ErpModule } from '@/types/erp-modules'

type ModuleOverviewCardProps = {
    module: ErpModule
}

export default function ModuleOverviewCard({ module }: ModuleOverviewCardProps) {
    const card = (
        <AdaptiveCard clickable className="h-full">
            <IconText
                className="mb-3 items-center gap-3"
                icon={
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep">
                        <ErpIcon icon={module.icon} />
                    </span>
                }
            >
                <span className="font-semibold heading-text">
                    {module.shortTitle} — {module.title}
                </span>
            </IconText>
            <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                {module.description}
            </p>
        </AdaptiveCard>
    )

    if (module.isExternalLink) {
        return (
            <a
                href={module.path}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full"
            >
                {card}
            </a>
        )
    }

    return <Link href={module.path}>{card}</Link>
}
