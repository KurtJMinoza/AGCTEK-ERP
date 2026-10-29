'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import SubmoduleCard from '@/components/erp/SubmoduleCard'
import Spinner from '@/components/ui/Spinner'
import {
    erpSubmoduleRoutePath,
    featurePermissionCode,
    findSubmoduleByRoute,
    getResolvedErpModules,
} from '@/configs/erp-modules'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
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
    const { can, loading } = usePermissions()

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
    const children = loading
        ? []
        : (resolvedSubmodule.children ?? []).filter((child) =>
              can(featurePermissionCode(module.code, resolvedSubmodule, child)),
          )
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
    const parentBreadcrumbs =
        breadcrumbItems.length > 1 ? breadcrumbItems.slice(0, -1) : breadcrumbItems

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title={resolvedSubmodule.title}
                description={resolvedSubmodule.description}
            />

            <div className="space-y-8">
                {loading && (
                    <div className="flex justify-center py-10">
                        <Spinner size={32} />
                    </div>
                )}
                {!loading && children.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No features are available for your role in this area.
                    </p>
                )}
                {groups.map((group, index) => {
                    const headingId = `feature-group-${index}`
                    return (
                        <section
                            key={group.title ?? headingId}
                            aria-labelledby={group.title ? headingId : undefined}
                        >
                            {group.title && (
                                <h2
                                    id={headingId}
                                    className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                >
                                    {group.title}
                                </h2>
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
        </PageContainer>
    )
}
