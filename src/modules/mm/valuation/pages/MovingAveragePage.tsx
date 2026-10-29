'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '../components/ValuationResponsiveTable'
import {
    ValDocNumberCell,
    ValMaterialCell,
    ValMoneyCell,
    ValPlainCell,
    ValQtyCell,
} from '../components/valuationTableUi'
import { valuationParentBreadcrumbs } from '../utils/valuationPageUi'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import { valuationService } from '../services/valuationService'
import type { MaterialValuation, ValuationTransaction } from '../types'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/moving-average'
type MapTab = 'map' | 'transactions'

const { TabList, TabNav, TabContent } = Tabs

const MovingAveragePage = () => {
    const parentBreadcrumbs = valuationParentBreadcrumbs(ROUTE)
    const [tab, setTab] = useState<MapTab>('map')
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
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={row.original.material?.materialCode ?? row.original.materialId}
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <ValPlainCell>
                        {row.original.warehouse?.name || row.original.warehouseId}
                    </ValPlainCell>
                ),
            },
            {
                header: 'MAP',
                cell: ({ row }) => (
                    <ValMoneyCell amount={row.original.movingAverageCost} emphasize="positive" />
                ),
            },
            {
                header: 'Standard',
                cell: ({ row }) => <ValMoneyCell amount={row.original.standardCost} />,
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
                        icon="map"
                    />
                ),
            },
            {
                header: 'Direction',
                cell: ({ row }) => (
                    <ValPlainCell mono>{row.original.direction}</ValPlainCell>
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
                header: 'MAP before',
                cell: ({ row }) => <ValMoneyCell amount={row.original.movingAvgBefore} />,
            },
            {
                header: 'MAP after',
                cell: ({ row }) => (
                    <ValMoneyCell amount={row.original.movingAvgAfter} emphasize="positive" />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Moving Average"
                description="Current MAP by valuation area and recent valuation postings"
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard>
                <Tabs value={tab} onChange={(v) => setTab(v as MapTab)}>
                    <TabList>
                        <TabNav value="map">Material MAP</TabNav>
                        <TabNav value="transactions">Valuation transactions</TabNav>
                    </TabList>
                    <div className="mt-4">
                        <TabContent value="map">
                            <ValuationResponsiveTable
                                columns={valCols}
                                data={vals}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[880px]"
                            />
                        </TabContent>
                        <TabContent value="transactions">
                            <ValuationResponsiveTable
                                columns={txnCols}
                                data={txns}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[960px]"
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default MovingAveragePage
