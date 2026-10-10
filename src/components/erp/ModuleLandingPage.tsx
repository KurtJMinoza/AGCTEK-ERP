import { notFound } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ModuleHeroCard from '@/components/erp/ModuleHeroCard'
import SubmoduleCard from '@/components/erp/SubmoduleCard'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    getAllSubmodules,
    getErpModule,
    getResolvedErpModules,
    submodulePermissionCode,
} from '@/configs/erp-modules'
import { hasPermission, type MyPermissions } from '@/services/PermissionService'
import type { ErpModule, ErpModuleCode } from '@/types/erp-modules'

type ModuleLandingPageProps = {
    moduleCode: string
    permissions: MyPermissions | null
}

/** Keeps only submodules the user can read; categories left empty are dropped. */
function visibleCategories(module: ErpModule, permissions: MyPermissions | null): ErpModule {
    return {
        ...module,
        categories: module.categories
            .map((category) => ({
                ...category,
                submodules: category.submodules.filter((submodule) => {
                    const code = submodulePermissionCode(module.code, submodule)
                    return !code || hasPermission(permissions, code, 'read')
                }),
            }))
            .filter((category) => category.submodules.length > 0),
    }
}

export default function ModuleLandingPage({ moduleCode, permissions }: ModuleLandingPageProps) {
    const module = getErpModule(moduleCode)

    if (!module) {
        notFound()
    }

    const resolvedModules = getResolvedErpModules()
    const resolvedModule = visibleCategories(
        resolvedModules.find((m) => m.code === moduleCode) ?? module,
        permissions,
    )
    const totalSubmodules = getAllSubmodules(resolvedModule).length
    const breadcrumbItems = buildErpBreadcrumbs(resolvedModule.path)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />

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
    return getResolvedErpModules()
        .filter((module) => !module.isExternalLink)
        .map((module) => ({
            moduleCode: module.code,
        }))
}
