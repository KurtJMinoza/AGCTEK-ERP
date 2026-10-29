'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ValuationResponsiveTable, {
    type ColumnDef,
} from '../components/ValuationResponsiveTable'
import {
    VAL_VARIANCE_STATUS,
    ValAnimatedStatus,
    ValDateCell,
    ValDocNumberCell,
    ValMaterialCell,
    ValMethodTag,
    ValMoneyCell,
    ValPlainCell,
    valStatusTone,
} from '../components/valuationTableUi'
import { valuationParentBreadcrumbs } from '../utils/valuationPageUi'
import Button from '@/components/ui/Button'
import { valuationService, type PriceVarianceRow } from '../services/valuationService'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/price-variance'

const PriceVariancePage = () => {
    const parentBreadcrumbs = valuationParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<PriceVarianceRow[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await valuationService.listPriceVariance({ limit: 100 })
            setRows(res.data)
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

    const columns: ColumnDef<PriceVarianceRow>[] = useMemo(
        () => [
            {
                header: 'Number',
                cell: ({ row }) => (
                    <ValDocNumberCell
                        primary={row.original.varianceNumber}
                        icon="variance"
                    />
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <ValMethodTag method={row.original.varianceType} />
                ),
            },
            {
                header: 'Material',
                cell: ({ row }) => (
                    <ValMaterialCell
                        code={
                            row.original.material?.materialCode ?? row.original.materialId
                        }
                        name={row.original.material?.materialName}
                    />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <ValPlainCell mono>
                        {row.original.warehouse?.code ||
                            row.original.warehouseId.slice(0, 8)}
                    </ValPlainCell>
                ),
            },
            {
                header: 'PO price',
                cell: ({ row }) => <ValMoneyCell amount={row.original.poPrice} />,
            },
            {
                header: 'Standard',
                cell: ({ row }) => <ValMoneyCell amount={row.original.standardCost} />,
            },
            {
                header: 'Invoice',
                cell: ({ row }) => <ValMoneyCell amount={row.original.invoicePrice} />,
            },
            {
                header: 'Landed',
                cell: ({ row }) => <ValMoneyCell amount={row.original.landedUnitCost} />,
            },
            {
                header: 'Actual',
                cell: ({ row }) => <ValMoneyCell amount={row.original.actualUnitCost} />,
            },
            {
                header: 'Variance',
                cell: ({ row }) => {
                    const n = Number(row.original.varianceAmount)
                    const emphasize =
                        Number.isFinite(n) && n !== 0
                            ? n > 0
                                ? 'positive'
                                : 'negative'
                            : undefined
                    return (
                        <ValMoneyCell
                            amount={row.original.varianceAmount}
                            emphasize={emphasize}
                        />
                    )
                },
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <ValAnimatedStatus
                        status={row.original.status}
                        tone={valStatusTone(row.original.status, VAL_VARIANCE_STATUS)}
                    />
                ),
            },
            {
                header: 'Date',
                cell: ({ row }) => <ValDateCell iso={row.original.createdAt} />,
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Price Variance"
                description="Auditable PPV / IPV / landed / revaluation variances — PO, standard, invoice, landed, and actual unit costs."
                breadcrumbs={parentBreadcrumbs}
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard>
                <ValuationResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[1280px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default PriceVariancePage
