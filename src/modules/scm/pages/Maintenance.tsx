'use client'

import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

export default function MaintenancePage() {
    return (
        <PageContainer>
            <PageHeader
                title="Maintenance"
                description="Preventative maintenance records that can block vehicle routing."
                breadcrumbs={scmPageBreadcrumbs('Maintenance')}
            />
            <AdaptiveCard>
                <Alert showIcon type="info" title="API ready">
                    Backend CRUD is available at <code>/scm/maintenance</code>.
                    UI list/create screens will be wired next.
                </Alert>
            </AdaptiveCard>
        </PageContainer>
    )
}
