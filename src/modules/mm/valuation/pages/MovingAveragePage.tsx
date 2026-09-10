'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import { valuationService } from '../services/valuationService'
import type { MaterialValuation, ValuationTransaction } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/moving-average'

const MovingAveragePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [vals, setVals] = useState<MaterialValuation[]>([])
    const [txns, setTxns] = useState<ValuationTransaction[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [v, t] = await Promise.all([
                valuationService.listMaterialValuations({
                    valuationMethod: 'MOVING_AVERAGE',
                    limit: 100,
                }),
                valuationService.listValuationTransactions({
                    valuationMethod: 'MOVING_AVERAGE',
                    limit: 50,
                }),
            ])
            setVals(v.data)
            setTxns(t.data)
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Load failed'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const valCols: ColumnDef<MaterialValuation>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.name || row.original.warehouseId,
            },
            { header: 'MAP', accessorKey: 'movingAverageCost' },
            { header: 'Standard', accessorKey: 'standardCost' },
        ],
        [],
    )

    const txnCols: ColumnDef<ValuationTransaction>[] = useMemo(
        () => [
            { header: 'Number', accessorKey: 'valuationNumber' },
            { header: 'Direction', accessorKey: 'direction' },
            { header: 'Qty', accessorKey: 'quantity' },
            { header: 'Unit Cost', accessorKey: 'unitCost' },
            { header: 'MAP Before', accessorKey: 'movingAvgBefore' },
            { header: 'MAP After', accessorKey: 'movingAvgAfter' },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Moving Average"
                description="Current MAP by valuation area and recent valuation postings"
                
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard className="mb-4" header={{ content: 'Material MAP' }}>
                <DataTable columns={valCols} data={vals} loading={loading} />
            </AdaptiveCard>
            <AdaptiveCard header={{ content: 'Valuation Transactions' }}>
                <DataTable columns={txnCols} data={txns} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default MovingAveragePage
