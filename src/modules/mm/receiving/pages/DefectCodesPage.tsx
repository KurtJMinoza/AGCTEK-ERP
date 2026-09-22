'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import { qualityService, type MmDefectCode } from '../services/qualityService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/receiving/defect-codes'

export default function DefectCodesPage() {
    const [rows, setRows] = useState<MmDefectCode[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await qualityService.listDefectCodes({ pageSize: 100 })
            setRows(res.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const columns: ColumnDef<MmDefectCode>[] = useMemo(
        () => [
            { header: 'Code', accessorKey: 'code' },
            { header: 'Description', accessorKey: 'description' },
            { header: 'Category', accessorKey: 'category' },
            { header: 'Default severity', accessorKey: 'severityDefault' },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Defect codes"
                description="Master defect codes used during inspection execution."
            />
            <DataTable columns={columns} data={rows} loading={loading} />
        </PageContainer>
    )
}
