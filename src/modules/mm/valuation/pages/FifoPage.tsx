'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '../components/ValuationResponsiveTable'
import {
    VAL_LAYER_STATUS,
    ValAnimatedStatus,
    ValDocNumberCell,
    ValMaterialCell,
    ValMoneyCell,
    ValQtyCell,
    valStatusTone,
} from '../components/valuationTableUi'
import { valuationParentBreadcrumbs } from '../utils/valuationPageUi'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import { valuationService } from '../services/valuationService'
import type { CostLayer, ValuationTransaction } from '../types'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/fifo'
type FifoTab = 'layers' | 'transactions'

const { TabList, TabNav, TabContent } = Tabs

const FifoPage = () => {
    const parentBreadcrumbs = valuationParentBreadcrumbs(ROUTE)
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
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={row.original.material?.materialCode ?? row.original.materialId}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Remaining',
                cell: ({ row }) => <ValQtyCell value={row.original.remainingQuantity} />,
            },
            {
                header: 'Unit cost',
                cell: ({ row }) => <ValMoneyCell amount={row.original.unitCost} />,
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <ValAnimatedStatus
                        status={row.original.status}
                        tone={valStatusTone(row.original.status, VAL_LAYER_STATUS)}
                    />
                ),
            },
        ],
        [],
    )

    const txnCols: ColumnDef<ValuationTransaction>[] = useMemo(
        () => [
            {
                header: 'Number',
                cell: ({ row }) => (
                    <ValDocNumberCell
                        primary={row.original.valuationNumber}
                        icon="fifo"
                    />
                ),
            },
            {
                header: 'Direction',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {row.original.direction}
                    </span>
                ),
            },
            {
                header: 'Qty',
                cell: ({ row }) => <ValQtyCell value={row.original.quantity} />,
            },
            {
                header: 'Unit cost',
                cell: ({ row }) => <ValMoneyCell amount={row.original.unitCost} />,
            },
            {
                header: 'Total',
                cell: ({ row }) => (
                    <ValMoneyCell amount={row.original.totalCost} emphasize="positive" />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="FIFO"
                description="Open cost layers and FIFO valuation transactions"
                breadcrumbs={parentBreadcrumbs}
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
                            <ValuationResponsiveTable
                                columns={layerCols}
                                data={layers}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[820px]"
                            />
                        </TabContent>
                        <TabContent value="transactions">
                            <ValuationResponsiveTable
                                columns={txnCols}
                                data={txns}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[900px]"
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default FifoPage
