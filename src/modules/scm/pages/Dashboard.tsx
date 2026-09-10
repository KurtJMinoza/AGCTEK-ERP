'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmDashboardBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

const links = [
    {
        title: 'Shipments',
        description:
            'Phase 2 Warehouse Interface — READY release stub + Phase 3.1 load assign.',
        href: '/scm/shipments',
        phase: '2 / 3.1',
    },
    {
        title: 'Trips',
        description:
            'Transportation Planning + Fleet & Dispatch (3.2) + Start IN_TRANSIT (3.3).',
        href: '/scm/trips',
        phase: '3.1–3.3',
    },
    {
        title: 'Tracking',
        description: 'In-Transit Monitoring — live GPS + active trip reference.',
        href: '/scm/tracking',
        phase: '3.3',
    },
    {
        title: 'Vehicles',
        description: 'Fleet capacityQty and routing eligibility.',
        href: '/scm/vehicles',
        phase: 'Fleet',
    },
    {
        title: 'Drivers',
        description: 'Minimal driver select (HCM master later).',
        href: '/scm/drivers',
        phase: 'Fleet',
    },
    {
        title: 'Maintenance',
        description: 'Preventative blocks that affect routing eligibility.',
        href: '/scm/maintenance',
        phase: 'Fleet',
    },
]

export default function ScmDashboard() {
    return (
        <PageContainer>
            <PageHeader
                title="Transportation Management"
                description="SCM logistics spine — Warehouse release → Load → Dispatch → In-transit. See docs/SCM_PROCESS_FLOW.md."
                breadcrumbs={scmDashboardBreadcrumbs()}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {links.map((item) => (
                    <Card key={item.href} bodyClass="flex h-full flex-col gap-3">
                        <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary">
                                {item.phase}
                            </p>
                            <h5 className="mt-1">{item.title}</h5>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                {item.description}
                            </p>
                        </div>
                        <div className="mt-auto">
                            <Link href={item.href}>
                                <Button size="sm" variant="solid">
                                    Open
                                </Button>
                            </Link>
                        </div>
                    </Card>
                ))}
            </div>
        </PageContainer>
    )
}
