import { getResolvedErpModules } from '@/configs/erp-modules'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import ModuleOverviewCard from '@/components/erp/ModuleOverviewCard'

const Page = () => {
    const modules = getResolvedErpModules()

    return (
        <PageContainer>
            <PageHeader
                title="Welcome to AGCTEK ERP"
                description="Select a module from the sidebar or choose one below to get started."
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
