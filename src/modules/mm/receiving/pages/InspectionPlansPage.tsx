'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    RcvAnimatedStatus,
    RcvPlanCell,
    RcvQtyCell,
    RcvPlainCell,
    rcvStatusTone,
} from '../components/receivingTableUi'
import { qualityService, type MmInspectionPlan } from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/inspection-plans'

const PLAN_STATUS: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    ACTIVE: 'success',
    INACTIVE: 'default',
    DRAFT: 'warning',
}

export default function InspectionPlansPage() {
    const [rows, setRows] = useState<MmInspectionPlan[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityService.listPlans({ pageSize: 50 })
            setRows(res.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const columns: ColumnDef<MmInspectionPlan>[] = useMemo(
        () => [
            {
                header: 'Plan',
                accessorKey: 'planCode',
                cell: ({ row }) => (
                    <RcvPlanCell planCode={row.original.planCode} name={row.original.name} />
                ),
            },
            {
                header: 'Sampling',
                accessorKey: 'samplingType',
                cell: ({ row }) => (
                    <RcvPlainCell>{row.original.samplingType?.replace(/_/g, ' ')}</RcvPlainCell>
                ),
            },
            {
                header: 'Characteristics',
                id: 'chars',
                cell: ({ row }) => (
                    <RcvQtyCell
                        value={row.original.characteristics?.length ?? 0}
                        label="Chars"
                    />
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <RcvAnimatedStatus
                        status={row.original.status}
                        tone={rcvStatusTone(row.original.status, PLAN_STATUS)}
                    />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Inspection plans"
                description="Reusable inspection plans with characteristics and sampling rules."
            />
            <AdaptiveCard>
                <ReceivingResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    mobile={{
                        title: (row) => row.planCode,
                        subtitle: (row) => row.name,
                        status: (row) => ({
                            text: row.status,
                            tone: rcvStatusTone(row.status, PLAN_STATUS),
                        }),
                        fields: [
                            {
                                label: 'Sampling',
                                value: (row) => row.samplingType ?? '—',
                            },
                            {
                                label: 'Characteristics',
                                value: (row) => String(row.characteristics?.length ?? 0),
                            },
                        ],
                    }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
