'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import Tag from '@/components/ui/Tag'
import ErpIcon from '@/components/erp/ErpIcon'
import type { ErpModule } from '@/types/erp-modules'

type ModuleHeroCardProps = {
    module: ErpModule
    totalSubmodules: number
}

export default function ModuleHeroCard({
    module,
    totalSubmodules,
}: ModuleHeroCardProps) {
    return (
        <AdaptiveCard className="mb-8">
            <IconText
                className="items-start gap-4"
                icon={
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-deep">
                        <ErpIcon icon={module.icon} className="text-3xl" />
                    </span>
                }
            >
                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Tag className="text-xs font-semibold uppercase">
                            {module.shortTitle}
                        </Tag>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {totalSubmodules} submodules
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold heading-text">
                        {module.title}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                        {module.description}
                    </p>
                </div>
            </IconText>
        </AdaptiveCard>
    )
}
