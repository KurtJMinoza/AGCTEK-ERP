'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import { valuationService, type PriceVarianceRow } from '../services/valuationService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/price-variance'

const fmt = (v: number | string | null | undefined) => {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return Number.isFinite(n)
        ? n.toLocaleString(undefined, { maximumFractionDigits: 6 })
        : '—'
}

const PriceVariancePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
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
            { header: 'Number', accessorKey: 'varianceNumber' },
            { header: 'Type', accessorKey: 'varianceType' },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.code || row.original.warehouseId.slice(0, 8),
            },
            {
                header: 'PO Price',
                cell: ({ row }) => fmt(row.original.poPrice),
            },
            {
                header: 'Standard',
                cell: ({ row }) => fmt(row.original.standardCost),
            },
            {
                header: 'Invoice',
                cell: ({ row }) => fmt(row.original.invoicePrice),
            },
            {
                header: 'Landed',
                cell: ({ row }) => fmt(row.original.landedUnitCost),
            },
            {
                header: 'Actual',
                cell: ({ row }) => fmt(row.original.actualUnitCost),
            },
            {
                header: 'Variance',
                cell: ({ row }) => fmt(row.original.varianceAmount),
            },
            { header: 'Status', accessorKey: 'status' },
            {
                header: 'Date',
                cell: ({ row }) =>
                    new Date(row.original.createdAt).toLocaleString(),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Price Variance"
                description="Auditable PPV / IPV / landed / revaluation variances — PO, standard, invoice, landed, and actual unit costs."
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default PriceVariancePage
