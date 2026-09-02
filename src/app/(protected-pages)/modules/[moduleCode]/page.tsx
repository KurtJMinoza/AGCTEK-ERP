import { notFound } from 'next/navigation'
import ModuleLandingPage, {
    getModuleStaticParams,
} from '@/components/erp/ModuleLandingPage'
import { isValidModuleCode } from '@/configs/erp-modules'

type PageProps = {
    params: Promise<{ moduleCode: string }>
}

export function generateStaticParams() {
    return getModuleStaticParams()
}

export async function generateMetadata({ params }: PageProps) {
    const { moduleCode } = await params
    const { getErpModule } = await import('@/configs/erp-modules')
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

    return <ModuleLandingPage moduleCode={moduleCode} />
}
