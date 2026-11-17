'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProcurementResponsiveTable, {
    type ColumnDef,
} from '@/modules/mm/procurement/components/ProcurementResponsiveTable'
import {
    PrcAnimatedStatus,
    PrcDocNumberCell,
    PrcPlainCell,
    PRC_INVOICE_STATUS,
    PRC_MATCH_STATUS,
    prcStatusTone,
} from '@/modules/mm/procurement/components/procurementTableUi'
import { procurementParentBreadcrumbs } from '@/modules/mm/procurement/utils/procurementPageUi'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { threeWayMatchService } from '../services/threeWayMatchService'
import type { SupplierInvoice } from '../types'

const ROUTE = '/modules/mm/procurement/three-way-match'

const ThreeWayMatchPage = () => {
    const parentBreadcrumbs = procurementParentBreadcrumbs(ROUTE)
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
            {
                header: 'Invoice',
                accessorKey: 'invoiceNumber',
                cell: ({ row }) => (
                    <PrcDocNumberCell
                        icon="invoice"
                        primary={row.original.invoiceNumber}
                        secondary={row.original.purchaseOrder?.poNumber}
                    />
                ),
            },
            {
                header: 'PO',
                cell: ({ row }) => (
                    <PrcPlainCell mono>
                        {row.original.purchaseOrder?.poNumber || row.original.purchaseOrderId}
                    </PrcPlainCell>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <PrcAnimatedStatus
                        status={row.original.status}
                        tone={prcStatusTone(row.original.status, PRC_INVOICE_STATUS)}
                    />
                ),
            },
            {
                header: 'Match',
                cell: ({ row }) =>
                    row.original.matchStatus ? (
                        <PrcAnimatedStatus
                            status={row.original.matchStatus}
                            tone={prcStatusTone(row.original.matchStatus, PRC_MATCH_STATUS)}
                        />
                    ) : (
                        <PrcPlainCell muted>—</PrcPlainCell>
                    ),
            },
            {
                header: 'Payment',
                cell: ({ row }) => (
                    <PrcPlainCell>{row.original.paymentEligible ? 'Eligible' : 'Blocked'}</PrcPlainCell>
                ),
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
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Three-Way Match"
                description="Match supplier invoices against PO and goods receipts"
                actions={
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                }
            />
            <AdaptiveCard>
                <ProcurementResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[920px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ThreeWayMatchPage
