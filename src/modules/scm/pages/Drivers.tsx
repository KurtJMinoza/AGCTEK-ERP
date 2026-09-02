'use client'

import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

export default function DriversPage() {
    return (
        <PageContainer>
            <PageHeader
                title="Drivers"
                description="Driver master data linked to ERP users."
                breadcrumbs={scmPageBreadcrumbs('Drivers')}
            />
            <AdaptiveCard>
                <Alert showIcon type="info" title="API ready">
                    Backend CRUD is available at <code>/scm/drivers</code>. UI
                    list/create screens will be wired next.
                </Alert>
            </AdaptiveCard>
        </PageContainer>
    )
}
