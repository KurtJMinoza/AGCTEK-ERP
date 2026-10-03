import { getResolvedErpModules } from '@/configs/erp-modules'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ModuleOverviewCard from '@/components/erp/ModuleOverviewCard'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import getMyPermissions, {
    canViewModule,
} from '@/server/actions/permissions/getMyPermissions'

const Page = async () => {
    const permissions = await getMyPermissions()
    const modules = getResolvedErpModules().filter((module) =>
        canViewModule(permissions, module.code),
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs('/home')} />

            <PageHeader
                title="Welcome to AGCTEK ERP"
                description={
                    modules.length
                        ? 'Select a module from the sidebar or choose one below to get started.'
                        : 'You do not have access to any modules yet. Contact your administrator.'
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {modules.map((module) => (
                    <ModuleOverviewCard key={module.code} module={module} />
                ))}
            </div>
        </PageContainer>
    )
}

export default Page
