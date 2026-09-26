import { notFound, redirect } from 'next/navigation'
import ModuleLandingPage, {
    getModuleStaticParams,
} from '@/components/erp/ModuleLandingPage'
import { getErpModule, isValidModuleCode } from '@/configs/erp-modules'

type PageProps = {
    params: Promise<{ moduleCode: string }>
}

export function generateStaticParams() {
    return getModuleStaticParams()
}

export async function generateMetadata({ params }: PageProps) {
    const { moduleCode } = await params
    const module = getErpModule(moduleCode)

    if (!module) {
        return { title: 'Module Not Found' }
    }

    return {
        title: `${module.shortTitle} — ${module.title} | AGCTEK ERP`,
        description: module.description,
    }
}

export default async function Page({ params }: PageProps) {
    const { moduleCode } = await params

    if (!isValidModuleCode(moduleCode)) {
        notFound()
    }

    const module = getErpModule(moduleCode)
    if (module?.isExternalLink) {
        redirect(module.path)
    }

    return <ModuleLandingPage moduleCode={moduleCode} />
}
