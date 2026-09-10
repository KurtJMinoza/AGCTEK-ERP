'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import { valuationService } from '../services/valuationService'
import type { ValuationTransaction } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/valuation/price-variance'

const fmt = (v: number | string | null | undefined) => {
    if (v == null || v === '') return '—'
    const n = Number(v)
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'
}

const PriceVariancePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ValuationTransaction[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await valuationService.listValuationTransactions({
                priceVarianceOnly: true,
                limit: 100,
            })
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

    const columns: ColumnDef<ValuationTransaction>[] = useMemo(
        () => [
            { header: 'Number', accessorKey: 'valuationNumber' },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode || row.original.materialId,
            },
            { header: 'Method', accessorKey: 'valuationMethod' },
            { header: 'Qty', accessorKey: 'quantity' },
            {
                header: 'PO Price',
                cell: ({ row }) => fmt(row.original.poUnitPrice),
            },
            {
                header: 'Receipt Price',
                cell: ({ row }) => fmt(row.original.receiptUnitPrice),
            },
            {
                header: 'Invoice Price',
                cell: ({ row }) => fmt(row.original.invoiceUnitPrice),
            },
            {
                header: 'Variance',
                accessorKey: 'priceVariance',
                cell: ({ row }) => fmt(row.original.priceVariance),
            },
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
                description="Standard-cost receipt variances and linked PO / receipt / invoice unit prices when available."
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
