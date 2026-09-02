import { notFound } from 'next/navigation'
import SubmoduleHubPage from '@/components/erp/SubmoduleHubPage'
import SubmodulePlaceholderPage from '@/components/erp/SubmodulePlaceholderPage'
import {
    findSubmoduleByPath,
    getResolvedErpModules,
    submoduleHasChildren,
} from '@/configs/erp-modules'

type PageProps = {
    params: Promise<{ moduleCode: string; submoduleCode: string }>
}

export function generateStaticParams() {
    return getResolvedErpModules().flatMap((module) =>
        module.categories.flatMap((category) =>
            category.submodules.map((submodule) => ({
                moduleCode: module.code,
                submoduleCode: submodule.code,
            })),
        ),
    )
}

export async function generateMetadata({ params }: PageProps) {
    const { moduleCode, submoduleCode } = await params
    const pathname = `/modules/${moduleCode}/${submoduleCode}`
    const match = findSubmoduleByPath(pathname)

    if (!match) {
        return { title: 'Submodule Not Found' }
    }

    return {
        title: `${match.submodule.title} | ${match.module.shortTitle} | AGCTEK ERP`,
        description: match.submodule.description,
    }
}

export default async function Page({ params }: PageProps) {
    const { moduleCode, submoduleCode } = await params
    const pathname = `/modules/${moduleCode}/${submoduleCode}`
    const match = findSubmoduleByPath(pathname)

    if (!match || match.child) {
        notFound()
    }

    if (submoduleHasChildren(match.submodule)) {
        return <SubmoduleHubPage pathname={pathname} />
    }

    return <SubmodulePlaceholderPage pathname={pathname} />
}
