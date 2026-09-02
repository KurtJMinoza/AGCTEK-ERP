'use client'

import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

export default function ShipmentsPage() {
    return (
        <PageContainer>
            <PageHeader
                title="Shipments"
                description="Shipment load building and last-mile POD."
                breadcrumbs={scmPageBreadcrumbs('Shipments')}
            />
            <AdaptiveCard>
                <Alert showIcon type="info" title="API ready">
                    Backend CRUD is available at <code>/scm/shipments</code>. UI
                    list/create screens will be wired next.
                </Alert>
            </AdaptiveCard>
        </PageContainer>
    )
}
