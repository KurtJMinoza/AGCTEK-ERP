'use client'

import { useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { qualityService, type QualityDashboard } from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/quality-dashboard'

export default function QualityDashboardPage() {
    const [data, setData] = useState<QualityDashboard | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        qualityService
            .dashboard()
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [])

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Quality Dashboard"
                description="Inspection throughput, acceptance rates, holds, and nonconformances."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <StatCard title="Open lots" value={loading ? '—' : String(data?.pendingLots ?? 0)} />
                <StatCard title="In progress" value={loading ? '—' : String(data?.inProgressLots ?? 0)} />
                <StatCard title="Pending decision" value={loading ? '—' : String(data?.pendingDecision ?? 0)} />
                <StatCard title="Active holds" value={loading ? '—' : String(data?.activeHolds ?? 0)} />
                <StatCard title="Acceptance rate" value={loading ? '—' : `${data?.acceptanceRate ?? 0}%`} />
                <StatCard title="Rejection rate" value={loading ? '—' : `${data?.rejectionRate ?? 0}%`} />
                <StatCard title="Return rate" value={loading ? '—' : `${data?.returnRate ?? 0}%`} />
                <StatCard title="Open NC" value={loading ? '—' : String(data?.openNonconformances ?? 0)} />
            </div>
            <AdaptiveCard title="Quick links" className="mb-4">
                <div className="flex flex-wrap gap-2">
                    <Link href="/modules/mm/receiving/inspection-queue">
                        <Button size="sm">Inspection queue</Button>
                    </Link>
                    <Link href="/modules/mm/receiving/quality-holds">
                        <Button size="sm">Quality holds</Button>
                    </Link>
                    <Link href="/modules/mm/receiving/nonconformances">
                        <Button size="sm">Nonconformances</Button>
                    </Link>
                    <Link href="/modules/mm/receiving/inspection-plans">
                        <Button size="sm">Inspection plans</Button>
                    </Link>
                    <Link href="/modules/mm/receiving/usage-decisions">
                        <Button size="sm">Usage decisions</Button>
                    </Link>
                </div>
            </AdaptiveCard>
            {data?.topDefects?.length ? (
                <AdaptiveCard title="Top defect codes">
                    <ul className="space-y-1 text-sm">
                        {data.topDefects.map((d) => (
                            <li key={d.code} className="flex justify-between">
                                <span>{d.code}</span>
                                <span className="text-gray-500">{d.count}</span>
                            </li>
                        ))}
                    </ul>
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}
