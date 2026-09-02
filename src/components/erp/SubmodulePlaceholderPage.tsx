'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import Tag from '@/components/ui/Tag'
import ErpIcon from '@/components/erp/ErpIcon'
import ErpBackLink from '@/components/erp/ErpBackLink'
import { findSubmoduleByPath, getResolvedErpModules } from '@/configs/erp-modules'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

type SubmodulePlaceholderPageProps = {
    pathname: string
}

export default function SubmodulePlaceholderPage({
    pathname,
}: SubmodulePlaceholderPageProps) {
    const match = findSubmoduleByPath(pathname)

    if (!match) {
        return null
    }

    const { module, category, submodule, child } = match
    const resolvedModule =
        getResolvedErpModules().find((item) => item.code === module.code) ??
        module
    const resolvedCategory =
        resolvedModule.categories.find((item) => item.code === category.code) ??
        category
    const resolvedSubmodule =
        resolvedCategory.submodules.find((item) => item.code === submodule.code) ??
        submodule
    const resolvedChild = child
        ? (resolvedSubmodule.children ?? []).find((item) => item.code === child.code) ??
          child
        : undefined

    const pageItem = resolvedChild ?? resolvedSubmodule
    const breadcrumbItems = buildErpBreadcrumbs(pathname)

    return (
        <PageContainer className="mx-auto max-w-3xl">
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={pageItem.title}
                description={pageItem.description}
            />

            <AdaptiveCard className="mt-6">
                <IconText
                    className="mb-6 items-center gap-3"
                    icon={
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep">
                            <ErpIcon icon={pageItem.icon} />
                        </span>
                    }
                >
                    <Tag className="text-xs font-semibold uppercase">
                        {resolvedModule.shortTitle} / {resolvedCategory.title}
                        {resolvedChild
                            ? ` / ${resolvedSubmodule.title}`
                            : ''}
                    </Tag>
                </IconText>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                    This page is ready for feature implementation. Route:{' '}
                    <code className="font-mono text-xs">{pageItem.path}</code>
                </p>
            </AdaptiveCard>
        </PageContainer>
    )
}
