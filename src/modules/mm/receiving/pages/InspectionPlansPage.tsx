'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import { qualityService, type MmInspectionPlan } from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/inspection-plans'

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
            { header: 'Plan code', accessorKey: 'planCode' },
            { header: 'Name', accessorKey: 'name' },
            { header: 'Sampling', accessorKey: 'samplingType' },
            {
                header: 'Characteristics',
                id: 'chars',
                cell: ({ row }) => row.original.characteristics?.length ?? 0,
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader title="Inspection plans" description="Reusable inspection plans with characteristics and sampling rules." />
            <DataTable columns={columns} data={rows} loading={loading} />
        </PageContainer>
    )
}
