import { notFound } from 'next/navigation'
import SubmodulePlaceholderPage from '@/components/erp/SubmodulePlaceholderPage'
import {
    findSubmoduleByPath,
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
    const pathname = `/modules/${moduleCode}/${submoduleCode}/${featureCode}`
    const match = findSubmoduleByPath(pathname)

    if (!match?.child) {
        return { title: 'Feature Not Found' }
    }

    return {
        title: `${match.child.title} | ${match.submodule.title} | ${match.module.shortTitle} | AGCTEK ERP`,
        description: match.child.description,
    }
}

export default async function Page({ params }: PageProps) {
    const { moduleCode, submoduleCode, featureCode } = await params
    const pathname = `/modules/${moduleCode}/${submoduleCode}/${featureCode}`
    const match = findSubmoduleByPath(pathname)

    if (!match?.child) {
        notFound()
    }

    return <SubmodulePlaceholderPage pathname={pathname} />
}
