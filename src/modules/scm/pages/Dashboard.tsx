'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import { scmDashboardBreadcrumbs } from '@/modules/scm/utils/breadcrumbs'

const links = [
    {
        title: 'Vehicles',
        description: 'Fleet capacity, odometer limits, and routing eligibility.',
        href: '/scm/vehicles',
    },
    {
        title: 'Drivers',
        description: 'Driver profiles linked to ERP users and license status.',
        href: '/scm/drivers',
    },
    {
        title: 'Shipments',
        description: 'Load building by weight/volume with POD capture.',
        href: '/scm/shipments',
    },
    {
        title: 'Trips',
        description: 'Multi-stop routing, time windows, and assignments.',
        href: '/scm/trips',
    },
    {
        title: 'Tracking',
        description: 'Live GPS / telematics positions by vehicle.',
        href: '/scm/tracking',
    },
    {
        title: 'Maintenance',
        description: 'Preventative maintenance that can block routing.',
        href: '/scm/maintenance',
    },
]

export default function ScmDashboard() {
    return (
        <PageContainer>
            <PageHeader
                title="Transportation Management"
                description="SCM logistics slice — fleet, trips, tracking, and maintenance."
                breadcrumbs={scmDashboardBreadcrumbs()}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {links.map((link) => (
                    <Card key={link.href} bodyClass="flex h-full flex-col gap-3">
                        <div>
                            <h5>{link.title}</h5>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                {link.description}
                            </p>
                        </div>
                        <div className="mt-auto">
                            <Link href={link.href}>
                                <Button size="sm">Open</Button>
                            </Link>
                        </div>
                    </Card>
                ))}
            </div>
        </PageContainer>
    )
}
