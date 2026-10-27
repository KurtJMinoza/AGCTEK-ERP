'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { inventoryControlService } from '../services/inventoryControlService'

const ROUTE = '/modules/mm/inventory-control/posted-adjustments'

const PostedAdjustmentsPage = () => {
    const [companyId, setCompanyId] = useState('')
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        if (!companyId.trim()) return
        setLoading(true)
        try {
            const res = await inventoryControlService.listAdjustmentRequests({
                companyId: companyId.trim(),
                status: 'POSTED',
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
        { header: 'Request', accessorKey: 'requestNumber' },
        { header: 'Warehouse', accessorKey: 'warehouse.code' },
        { header: 'Value', accessorKey: 'totalAdjustmentValue' },
        { header: 'Posted adjustment', accessorKey: 'legacyAdjustmentId' },
        { header: 'Finance approver', accessorKey: 'financeApprovedBy' },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Posted Adjustments"
                description="Immutable count adjustment requests posted through InventoryPostingService."
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

export default PostedAdjustmentsPage
