'use client'

import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'

/**
 * Phase 1 stub — Demand & Supply Planning.
 * Empty placeholder so navigation exists; does not block logistics EXECUTE.
 */
export default function DemandPlanningPage() {
    return (
        <PageContainer>
            <PageHeader
                title="Demand & Supply Planning"
                description="Phase 1 PLAN stub — forecast and consensus planning will land here. Not required for EXECUTE."
                breadcrumbs={scmPageBreadcrumbs('Demand planning', 'planning')}
            />

            <Alert showIcon type="info" className="mb-4" title="Stub only">
                Demand planning is out of scope for the logistics spine. Use
                Shipments → Assign → Trips → Tracking for Phase 2–3.3.
            </Alert>

            <AdaptiveCard>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    Continue with warehouse release and transportation
                    execution, or configure planning horizons:
                </p>
                <div className="flex flex-wrap gap-2">
                    <Link href="/scm/planning-horizons">
                        <Button>Planning Horizons</Button>
                    </Link>
                    <Link href="/scm/shipments">
                        <Button variant="solid">Shipments (Phase 2)</Button>
                    </Link>
                    <Link href="/scm/trips">
                        <Button>Trips / Dispatch</Button>
                    </Link>
                    <Link href="/scm/tracking">
                        <Button>Live Tracking</Button>
                    </Link>
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}
