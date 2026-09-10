'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { threeWayMatchService } from '../services/threeWayMatchService'
import type { SupplierInvoice } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/procurement/three-way-match'

const ThreeWayMatchPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<SupplierInvoice[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await threeWayMatchService.listInvoices({ limit: 100 })
            setRows(
                res.data.filter((r) =>
                    [
                        'SUBMITTED',
                        'MATCHED',
                        'PARTIALLY_MATCHED',
                        'VARIANCE',
                        'BLOCKED',
                    ].includes(r.status),
                ),
            )
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

    const columns: ColumnDef<SupplierInvoice>[] = useMemo(
        () => [
            { header: 'Invoice', accessorKey: 'invoiceNumber' },
            {
                header: 'PO',
                cell: ({ row }) =>
                    row.original.purchaseOrder?.poNumber || row.original.purchaseOrderId,
            },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Match',
                cell: ({ row }) => row.original.matchStatus || '—',
            },
            {
                header: 'Payment Eligible',
                cell: ({ row }) => (row.original.paymentEligible ? 'Yes' : 'No'),
            },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <div className="flex gap-1 flex-wrap">
                        {['SUBMITTED', 'VARIANCE', 'BLOCKED', 'PARTIALLY_MATCHED'].includes(
                            row.original.status,
                        ) && (
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={async () => {
                                    try {
                                        const r = await threeWayMatchService.runMatch(
                                            row.original.id,
                                        )
                                        toast.push(
                                            <Notification type="success" title="Match" closable>
                                                Result: {r.status}
                                            </Notification>,
                                        )
                                        load()
                                    } catch (e: any) {
                                        toast.push(
                                            <Notification type="danger" title="Fail" closable>
                                                {e?.response?.data?.message || e.message}
                                            </Notification>,
                                        )
                                    }
                                }}
                            >
                                Run Match
                            </Button>
                        )}
                        {['MATCHED', 'PARTIALLY_MATCHED'].includes(row.original.status) && (
                            <Button
                                size="xs"
                                onClick={async () => {
                                    try {
                                        await threeWayMatchService.approveInvoice(
                                            row.original.id,
                                            { approvedBy: 'mm-user' },
                                        )
                                        toast.push(
                                            <Notification type="success" title="Approved" closable>
                                                Invoice approved for AP
                                            </Notification>,
                                        )
                                        load()
                                    } catch (e: any) {
                                        toast.push(
                                            <Notification type="danger" title="Fail" closable>
                                                {e?.response?.data?.message || e.message}
                                            </Notification>,
                                        )
                                    }
                                }}
                            >
                                Approve
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [load],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Three-Way Match"
                description="Match supplier invoices against PO and goods receipts"
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

export default ThreeWayMatchPage
