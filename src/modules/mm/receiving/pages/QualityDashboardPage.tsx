'use client'

import { useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { qualityService, type QualityDashboard } from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    RcvCodeCell,
    RcvQtyCell,
    rcvMobileCardEnterClass,
} from '../components/receivingTableUi'

const ROUTE = '/modules/mm/receiving/quality-dashboard'

type DefectRow = { code: string; count: number }

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

    const defectRows: DefectRow[] = useMemo(
        () => data?.topDefects?.map((d) => ({ code: d.code, count: d.count })) ?? [],
        [data],
    )

    const defectColumns: ColumnDef<DefectRow>[] = useMemo(
        () => [
            {
                header: 'Defect code',
                accessorKey: 'code',
                cell: ({ row }) => <RcvCodeCell code={row.original.code} />,
            },
            {
                header: 'Occurrences',
                accessorKey: 'count',
                cell: ({ row }) => <RcvQtyCell value={row.original.count} label="Hits" />,
            },
        ],
        [],
    )

    const statClass = (index: number) =>
        `${rcvMobileCardEnterClass(index)} motion-reduce:animate-none`

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Quality Dashboard"
                description="Inspection throughput, acceptance rates, holds, and nonconformances."
            />
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    { title: 'Open lots', value: loading ? '—' : String(data?.pendingLots ?? 0) },
                    { title: 'In progress', value: loading ? '—' : String(data?.inProgressLots ?? 0) },
                    { title: 'Pending decision', value: loading ? '—' : String(data?.pendingDecision ?? 0) },
                    { title: 'Active holds', value: loading ? '—' : String(data?.activeHolds ?? 0) },
                    { title: 'Acceptance rate', value: loading ? '—' : `${data?.acceptanceRate ?? 0}%` },
                    { title: 'Rejection rate', value: loading ? '—' : `${data?.rejectionRate ?? 0}%` },
                    { title: 'Return rate', value: loading ? '—' : `${data?.returnRate ?? 0}%` },
                    { title: 'Open NC', value: loading ? '—' : String(data?.openNonconformances ?? 0) },
                ].map((stat, index) => (
                    <div key={stat.title} className={statClass(index)}>
                        <StatCard title={stat.title} value={stat.value} />
                    </div>
                ))}
            </div>
            <AdaptiveCard title="Quick links" className={`mb-4 ${statClass(8)}`}>
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
            {defectRows.length ? (
                <AdaptiveCard title="Top defect codes" className={statClass(9)}>
                    <ReceivingResponsiveTable
                        columns={defectColumns}
                        data={defectRows}
                        loading={loading}
                        getRowId={(row) => row.code}
                        hidePagination
                        mobile={{
                            title: (row) => row.code,
                            fields: [{ label: 'Occurrences', value: (row) => String(row.count) }],
                        }}
                    />
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}
