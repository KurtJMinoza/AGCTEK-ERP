import { notFound } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import ModuleHeroCard from '@/components/erp/ModuleHeroCard'
import SubmoduleCard from '@/components/erp/SubmoduleCard'
import {
    getAllSubmodules,
    getErpModule,
    getResolvedErpModules,
} from '@/configs/erp-modules'
import type { ErpModuleCode } from '@/types/erp-modules'

type ModuleLandingPageProps = {
    moduleCode: string
}

export default function ModuleLandingPage({ moduleCode }: ModuleLandingPageProps) {
    const module = getErpModule(moduleCode)

    if (!module) {
        notFound()
    }

    const resolvedModules = getResolvedErpModules()
    const resolvedModule =
        resolvedModules.find((m) => m.code === moduleCode) ?? module
    const totalSubmodules = getAllSubmodules(resolvedModule).length

    return (
        <PageContainer>
            <ModuleHeroCard
                module={resolvedModule}
                totalSubmodules={totalSubmodules}
            />

            <div className="space-y-8">
                {resolvedModule.categories.map((category) => (
                    <section
                        key={category.code}
                        aria-labelledby={`category-${category.code}`}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2
                                id={`category-${category.code}`}
                                className="text-xs font-medium text-gray-500 dark:text-gray-400"
                            >
                                {category.title}
                            </h2>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                {category.submodules.length}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {category.submodules.map((submodule) => (
                                <SubmoduleCard
                                    key={submodule.code}
                                    submodule={submodule}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </PageContainer>
    )
}

export function getModuleStaticParams(): { moduleCode: ErpModuleCode }[] {
    return getResolvedErpModules().map((module) => ({
        moduleCode: module.code,
    }))
}
