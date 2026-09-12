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
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import { adjustmentService } from '../../inventory/services/adjustmentService'
import type { InventoryCount, CountAdjustmentRequest } from '../types'
import type { InventoryAdjustment } from '../../inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/adjustment-approval'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const AdjustmentApprovalPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [counts, setCounts] = useState<InventoryCount[]>([])
    const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([])
    const [requests, setRequests] = useState<CountAdjustmentRequest[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [c, a, reqs] = await Promise.all([
                inventoryControlService.listCounts({ status: 'APPROVAL', limit: 50 }),
                adjustmentService.list({ status: 'PENDING_APPROVAL', pageSize: 50 }),
                inventoryControlService.listAdjustmentRequests({
                    status: 'PENDING_APPROVAL',
                    pageSize: 50,
                }),
            ])
            setCounts(c.data)
            setAdjustments(
                (a.data ?? []).filter(
                    (x: any) => x.sourceCountId || x.justification?.includes('count'),
                ),
            )
            setRequests(reqs.data ?? [])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const countColumns: ColumnDef<InventoryCount>[] = useMemo(
        () => [
            { header: 'Count #', accessorKey: 'countNumber' },
            {
                header: 'Type',
                accessorKey: 'countType',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.name ?? '—',
            },
            {
                header: 'Adjustment',
                cell: ({ row }) =>
                    row.original.adjustment
                        ? `${row.original.adjustment.documentNumber} (${row.original.adjustment.status})`
                        : '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) => (
                    <div className="flex gap-1">
                        <Button
                            size="xs"
                            variant="solid"
                            icon={<HiOutlineCheck />}
                            onClick={async () => {
                                try {
                                    await inventoryControlService.approve(row.original.id, {
                                        approvedBy: 'approver',
                                    })
                                    await inventoryControlService.postAdjustments(
                                        row.original.id,
                                        {
                                            approvedBy: 'approver',
                                            adjustmentReason: 'COUNT_VARIANCE',
                                        },
                                    )
                                    pushToast('success', 'Posted', 'Count approved & adjusted')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Failed',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Approve & Post
                        </Button>
                        <Button
                            size="xs"
                            icon={<HiOutlineX />}
                            onClick={async () => {
                                try {
                                    await inventoryControlService.reject(row.original.id, {
                                        reason: 'Rejected by approver',
                                    })
                                    pushToast('success', 'Rejected', 'No ledger change')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Failed',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Reject
                        </Button>
                    </div>
                ),
            },
        ],
        [load],
    )

    const adjColumns: ColumnDef<InventoryAdjustment>[] = useMemo(
        () => [
            { header: 'Document', accessorKey: 'documentNumber' },
            {
                header: 'Reason',
                accessorKey: 'adjustmentReason',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) => (
                    <div className="flex gap-1">
                        <Button
                            size="xs"
                            variant="solid"
                            onClick={async () => {
                                try {
                                    await adjustmentService.approve(row.original.id, 'approver')
                                    pushToast('success', 'Approved', 'Adjustment posted')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Failed',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Approve
                        </Button>
                        <Button
                            size="xs"
                            onClick={async () => {
                                try {
                                    await adjustmentService.reject(row.original.id, 'Rejected')
                                    pushToast('success', 'Rejected', 'No ledger change')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Failed',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Reject
                        </Button>
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
                title="Adjustment Approval"
                description="Approve or reject count sessions and count-sourced inventory adjustments."
                actions={<Button onClick={load}>Refresh</Button>}
            />

            <AdaptiveCard className="mb-4">
                <h4 className="mb-3 font-semibold">Counts awaiting approval</h4>
                <DataTable columns={countColumns} data={counts} loading={loading} />
            </AdaptiveCard>

            <AdaptiveCard className="mb-4">
                <h4 className="mb-3 font-semibold">Count adjustment requests</h4>
                <DataTable
                    columns={[
                        { header: 'Request #', accessorKey: 'requestNumber' },
                        {
                            header: 'Warehouse',
                            cell: ({ row }) =>
                                (row.original as CountAdjustmentRequest).warehouse?.code ?? '—',
                        },
                        {
                            header: 'Status',
                            cell: ({ row }) => (
                                <StatusBadge tone="warning">
                                    {(row.original as CountAdjustmentRequest).status}
                                </StatusBadge>
                            ),
                        },
                        {
                            header: '',
                            id: 'req-act',
                            cell: ({ row }) => {
                                const req = row.original as CountAdjustmentRequest
                                return (
                                    <div className="flex gap-1">
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            onClick={async () => {
                                                try {
                                                    await inventoryControlService.approveAdjustmentRequest(
                                                        req.id,
                                                        { approvedBy: 'approver' },
                                                    )
                                                    pushToast(
                                                        'success',
                                                        'Posted',
                                                        'COUNT_GAIN/LOSS posted',
                                                    )
                                                    load()
                                                } catch (e: any) {
                                                    pushToast(
                                                        'danger',
                                                        'Failed',
                                                        e?.response?.data?.message ?? e.message,
                                                    )
                                                }
                                            }}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="xs"
                                            onClick={async () => {
                                                try {
                                                    await inventoryControlService.rejectAdjustmentRequest(
                                                        req.id,
                                                        {
                                                            rejectedBy: 'approver',
                                                            rejectionReason: 'Rejected',
                                                        },
                                                    )
                                                    pushToast(
                                                        'success',
                                                        'Rejected',
                                                        'No ledger change',
                                                    )
                                                    load()
                                                } catch (e: any) {
                                                    pushToast(
                                                        'danger',
                                                        'Failed',
                                                        e?.response?.data?.message ?? e.message,
                                                    )
                                                }
                                            }}
                                        >
                                            Reject
                                        </Button>
                                    </div>
                                )
                            },
                        },
                    ]}
                    data={requests}
                    loading={loading}
                />
            </AdaptiveCard>

            <AdaptiveCard>
                <h4 className="mb-3 font-semibold">Pending inventory adjustments</h4>
                <DataTable columns={adjColumns} data={adjustments} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AdjustmentApprovalPage
