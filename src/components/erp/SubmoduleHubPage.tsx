'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import SubmoduleCard from '@/components/erp/SubmoduleCard'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import Tag from '@/components/ui/Tag'
import ErpIcon from '@/components/erp/ErpIcon'
import {
    erpSubmoduleRoutePath,
    findSubmoduleByRoute,
    getResolvedErpModules,
} from '@/configs/erp-modules'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import type { ErpSubmodule } from '@/types/erp-modules'

type SubmoduleHubPageProps = {
    moduleCode: string
    submoduleCode: string
}

export default function SubmoduleHubPage({
    moduleCode,
    submoduleCode,
}: SubmoduleHubPageProps) {
    const pathname = erpSubmoduleRoutePath(moduleCode, submoduleCode)
    const match = findSubmoduleByRoute(moduleCode, submoduleCode)

    if (!match || !match.submodule.children?.length) {
        return null
    }

    const { module, category, submodule } = match
    const resolvedModule =
        getResolvedErpModules().find((item) => item.code === module.code) ??
        module
    const resolvedCategory =
        resolvedModule.categories.find((item) => item.code === category.code) ??
        category
    const resolvedSubmodule =
        resolvedCategory.submodules.find((item) => item.code === submodule.code) ??
        submodule
    const children = resolvedSubmodule.children ?? []
    const groups = children.reduce<{ title?: string; items: ErpSubmodule[] }[]>(
        (acc, child) => {
            const existing = acc.find((group) => group.title === child.group)
            if (existing) existing.items.push(child)
            else acc.push({ title: child.group, items: [child] })
            return acc
        },
        [],
    )
    const breadcrumbItems = buildErpBreadcrumbs(
        resolvedSubmodule.path || pathname,
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />

            <AdaptiveCard className="mb-8">
                <IconText
                    className="items-start gap-4"
                    icon={
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-deep">
                            <ErpIcon
                                icon={resolvedSubmodule.icon}
                                className="text-3xl"
                            />
                        </span>
                    }
                >
                    <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Tag className="text-xs font-semibold uppercase">
                                {resolvedModule.shortTitle} / {resolvedCategory.title}
                            </Tag>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {children.length} features
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold heading-text">
                            {resolvedSubmodule.title}
                        </h1>
                        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                            {resolvedSubmodule.description}
                        </p>
                    </div>
                </IconText>
            </AdaptiveCard>

            <section aria-labelledby="submodule-features">
                <PageHeader
                    className="mb-4"
                    title={resolvedSubmodule.childGroupTitle ?? 'Features'}
                    description="Select a feature to configure or manage."
                />

                <div className="space-y-8">
                    {groups.map((group, index) => {
                        const headingId = `feature-group-${index}`
                        return (
                            <section
                                key={group.title ?? headingId}
                                aria-labelledby={group.title ? headingId : undefined}
                            >
                                {group.title && (
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <h2
                                            id={headingId}
                                            className="text-xs font-medium text-gray-500 dark:text-gray-400"
                                        >
                                            {group.title}
                                        </h2>
                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                            {group.items.length}
                                        </span>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {group.items.map((child) => (
                                        <SubmoduleCard
                                            key={child.code}
                                            submodule={child}
                                        />
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                </div>
            </section>
        </PageContainer>
    )
}
