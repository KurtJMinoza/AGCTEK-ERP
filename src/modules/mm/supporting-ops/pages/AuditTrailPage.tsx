'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { supportingOpsService } from '../services/supportingOpsService'

const ROUTE = '/modules/mm/supporting-operations/audit-trail'

const AuditTrailPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await supportingOpsService.listAudit({
                companyId: companyId.trim(),
                pageSize: 100,
            })
            setRows(res.data)
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<any>[] = [
        { header: 'When', accessorKey: 'performedAt', cell: ({ row }) => new Date(row.original.performedAt).toLocaleString() },
        { header: 'Domain', accessorKey: 'domain' },
        { header: 'Action', accessorKey: 'action' },
        { header: 'Entity', accessorKey: 'entityNumber' },
        { header: 'By', accessorKey: 'performedBy' },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Audit Trail"
                description="Append-only compliance audit entries (no delete from UI)."
            />
            <AdaptiveCard>
                <Input
                    className="mb-4 max-w-md"
                    placeholder="Company ID"
                    value={companyId}
                    onChange={(e: any) => setCompanyId(e.target.value)}
                />
                <DataTable columns={columns} data={rows} loading={loading} hidePagination />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AuditTrailPage
