'use client'

import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import ActionLink from '@/components/shared/ActionLink'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IconText from '@/components/shared/IconText'
import Tag from '@/components/ui/Tag'
import ErpIcon from '@/components/erp/ErpIcon'
import { findSubmoduleByPath } from '@/configs/erp-modules'

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

    const { module, category, submodule } = match

    return (
        <PageContainer className="mx-auto max-w-3xl">
            <ActionLink
                href={module.path}
                className="mb-4 inline-flex items-center gap-1 text-sm font-medium"
            >
                ← Back to {module.shortTitle}
            </ActionLink>

            <PageHeader
                title={submodule.title}
                description={submodule.description}
            />

            <AdaptiveCard className="mt-6">
                <IconText
                    className="mb-6 items-center gap-3"
                    icon={
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep">
                            <ErpIcon icon={submodule.icon} />
                        </span>
                    }
                >
                    <Tag className="text-xs font-semibold uppercase">
                        {module.shortTitle} / {category.title}
                    </Tag>
                </IconText>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                    This submodule page is ready for feature implementation.
                    Route:{' '}
                    <code className="font-mono text-xs">{submodule.path}</code>
                </p>
            </AdaptiveCard>
        </PageContainer>
    )
}
