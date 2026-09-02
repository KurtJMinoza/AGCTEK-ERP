'use client'

import Alert from '@/components/ui/Alert'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

export default function TrackingPage() {
    return (
        <PageContainer>
            <PageHeader
                title="Tracking"
                description="Live GPS / telematics latest position and history."
                breadcrumbs={scmPageBreadcrumbs('Tracking')}
            />
            <AdaptiveCard>
                <Alert showIcon type="info" title="API ready">
                    Backend endpoints are available under{' '}
                    <code>/scm/tracking</code>. Map UI will be wired next.
                </Alert>
            </AdaptiveCard>
        </PageContainer>
    )
}
