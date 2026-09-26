import { notFound, redirect } from 'next/navigation'
import SubmoduleHubPage from '@/components/erp/SubmoduleHubPage'
import SubmodulePlaceholderPage from '@/components/erp/SubmodulePlaceholderPage'
import {
    erpSubmoduleRoutePath,
    findChildByRouteInModule,
    findSubmoduleByRoute,
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
    const match =
        findSubmoduleByRoute(moduleCode, submoduleCode) ??
        findChildByRouteInModule(moduleCode, submoduleCode)

    if (!match) {
        return { title: 'Submodule Not Found' }
    }

    const pageItem = 'child' in match ? match.child : match.submodule

    return {
        title: `${pageItem.title} | ${match.module.shortTitle} | AGCTEK ERP`,
        description: pageItem.description,
    }
}

export default async function Page({ params }: PageProps) {
    const { moduleCode, submoduleCode } = await params
    const segmentPath = erpSubmoduleRoutePath(moduleCode, submoduleCode)

    const childMatch = findChildByRouteInModule(moduleCode, submoduleCode)
    if (childMatch) {
        redirect(childMatch.child.path)
    }

    const match = findSubmoduleByRoute(moduleCode, submoduleCode)
    if (!match) {
        notFound()
    }

    const { submodule } = match
    if (submodule.path !== segmentPath) {
        redirect(submodule.path)
    }

    if (submoduleHasChildren(submodule)) {
        return (
            <SubmoduleHubPage
                moduleCode={moduleCode}
                submoduleCode={submoduleCode}
            />
        )
    }

    return <SubmodulePlaceholderPage pathname={segmentPath} />
}
