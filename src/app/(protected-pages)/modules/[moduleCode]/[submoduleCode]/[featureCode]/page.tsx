import { notFound, redirect } from 'next/navigation'
import SubmodulePlaceholderPage from '@/components/erp/SubmodulePlaceholderPage'
import {
    erpFeatureRoutePath,
    findFeatureByRoute,
    getNestedSubmoduleStaticParams,
} from '@/configs/erp-modules'

type PageProps = {
    params: Promise<{
        moduleCode: string
        submoduleCode: string
        featureCode: string
    }>
}

export function generateStaticParams() {
    return getNestedSubmoduleStaticParams()
}

export async function generateMetadata({ params }: PageProps) {
    const { moduleCode, submoduleCode, featureCode } = await params
    const match = findFeatureByRoute(
        moduleCode,
        submoduleCode,
        featureCode,
    )

    if (!match) {
        return { title: 'Feature Not Found' }
    }

    return {
        title: `${match.child.title} | ${match.submodule.title} | ${match.module.shortTitle} | AGCTEK ERP`,
        description: match.child.description,
    }
}

export default async function Page({ params }: PageProps) {
    const { moduleCode, submoduleCode, featureCode } = await params
    const segmentPath = erpFeatureRoutePath(
        moduleCode,
        submoduleCode,
        featureCode,
    )

    const match = findFeatureByRoute(
        moduleCode,
        submoduleCode,
        featureCode,
    )
    if (!match) {
        notFound()
    }

    if (match.child.path !== segmentPath) {
        redirect(match.child.path)
    }

    return <SubmodulePlaceholderPage pathname={segmentPath} />
}
