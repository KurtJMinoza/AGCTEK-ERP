'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import { valuationService } from '../services/valuationService'
import type { CostLayer, ValuationTransaction } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/fifo'
type FifoTab = 'layers' | 'transactions'

const { TabList, TabNav, TabContent } = Tabs

const FifoPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState<FifoTab>('layers')
    const [layers, setLayers] = useState<CostLayer[]>([])
    const [txns, setTxns] = useState<ValuationTransaction[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [l, t] = await Promise.all([
                valuationService.listCostLayers({ status: 'OPEN', limit: 100 }),
                valuationService.listValuationTransactions({
                    valuationMethod: 'FIFO',
                    limit: 50,
                }),
            ])
            setLayers(l.data)
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

    const layerCols: ColumnDef<CostLayer>[] = useMemo(
        () => [
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            { header: 'Remaining', accessorKey: 'remainingQuantity' },
            { header: 'Unit Cost', accessorKey: 'unitCost' },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
        ],
        [],
    )

    const txnCols: ColumnDef<ValuationTransaction>[] = useMemo(
        () => [
            { header: 'Number', accessorKey: 'valuationNumber' },
            { header: 'Direction', accessorKey: 'direction' },
            { header: 'Qty', accessorKey: 'quantity' },
            { header: 'Unit Cost', accessorKey: 'unitCost' },
            { header: 'Total', accessorKey: 'totalCost' },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="FIFO"
                description="Open cost layers and FIFO valuation transactions"
                
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v as FifoTab)}>
                    <TabList>
                        <TabNav value="layers">Open layers</TabNav>
                        <TabNav value="transactions">FIFO transactions</TabNav>
                    </TabList>
                    <div className="mt-4">
                        <TabContent value="layers">
                            <DataTable columns={layerCols} data={layers} loading={loading} />
                        </TabContent>
                        <TabContent value="transactions">
                            <DataTable columns={txnCols} data={txns} loading={loading} />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default FifoPage
