'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ReceivingResponsiveTable, { type ColumnDef } from '../components/ReceivingResponsiveTable'
import {
    RcvCodeCell,
    RcvPlainCell,
    RcvSeverityCell,
} from '../components/receivingTableUi'
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
            {
                header: 'Code',
                accessorKey: 'code',
                cell: ({ row }) => (
                    <RcvCodeCell
                        code={row.original.code}
                        description={row.original.description}
                    />
                ),
            },
            {
                header: 'Category',
                accessorKey: 'category',
                cell: ({ row }) => <RcvPlainCell>{row.original.category}</RcvPlainCell>,
            },
            {
                header: 'Default severity',
                accessorKey: 'severityDefault',
                cell: ({ row }) => (
                    <RcvSeverityCell severity={row.original.severityDefault} />
                ),
            },
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
            <AdaptiveCard>
                <ReceivingResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    mobile={{
                        title: (row) => row.code,
                        subtitle: (row) => row.description,
                        fields: [
                            { label: 'Category', value: (row) => row.category ?? '—' },
                            {
                                label: 'Severity',
                                value: (row) => row.severityDefault ?? '—',
                            },
                        ],
                    }}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
