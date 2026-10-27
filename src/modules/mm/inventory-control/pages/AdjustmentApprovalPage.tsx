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
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import { adjustmentService } from '../../inventory/services/adjustmentService'
import type { InventoryCount, CountAdjustmentRequest } from '../types'
import type { InventoryAdjustment } from '../../inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Iso9001WorkflowStrip from '../components/Iso9001WorkflowStrip'

const ROUTE = '/modules/mm/inventory-control/adjustment-approval'
type ApprovalTab = 'counts' | 'requests' | 'adjustments'

const { TabList, TabNav, TabContent } = Tabs

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
    const [activeTab, setActiveTab] = useState<ApprovalTab>('counts')

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

    const requestColumns: ColumnDef<CountAdjustmentRequest>[] = useMemo(
        () => [
            { header: 'Request #', accessorKey: 'requestNumber' },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'req-act',
                cell: ({ row }) => {
                    const req = row.original
                    const pending = req.status === 'PENDING_APPROVAL' || req.status === 'DRAFT'
                    const pendingFinance = req.status === 'PENDING_FINANCE_APPROVAL'
                    const approved = req.status === 'APPROVED'
                    return (
                        <div className="flex flex-wrap gap-1">
                            {pendingFinance ? (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={async () => {
                                        try {
                                            await inventoryControlService.approveFinanceAdjustmentRequest(
                                                req.id,
                                                { approvedBy: 'finance-controller' },
                                            )
                                            pushToast(
                                                'success',
                                                'Finance approved',
                                                'Ready for inventory posting',
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
                                    Finance approve
                                </Button>
                            ) : null}
                            {pending ? (
                                <>
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        onClick={async () => {
                                            try {
                                                await inventoryControlService.approveAdjustmentRequest(
                                                    req.id,
                                                    { approvedBy: 'finance-controller' },
                                                )
                                                pushToast(
                                                    'success',
                                                    'Approved',
                                                    'Management approval recorded (no ledger change yet)',
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
                                                        rejectedBy: 'finance-controller',
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
                                </>
                            ) : null}
                            {approved ? (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    onClick={async () => {
                                        try {
                                            await inventoryControlService.postAdjustmentRequest(
                                                req.id,
                                                { approvedBy: 'warehouse-manager' },
                                            )
                                            pushToast(
                                                'success',
                                                'Posted',
                                                'COUNT_GAIN/LOSS posted to inventory ledger',
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
                                    Post to ledger
                                </Button>
                            ) : null}
                        </div>
                    )
                },
            },
        ],
        [load],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Adjustment Approval"
                description="ISO 9001 step 4: management approval before posting count variances to the inventory ledger."
                actions={<Button onClick={load}>Refresh</Button>}
            />
            <Iso9001WorkflowStrip activeStep={4} />

            <AdaptiveCard>
                <Tabs
                    value={activeTab}
                    onChange={(v) => setActiveTab(v as ApprovalTab)}
                >
                    <TabList>
                        <TabNav value="counts">
                            Counts awaiting approval ({counts.length})
                        </TabNav>
                        <TabNav value="requests">
                            Count adjustment requests ({requests.length})
                        </TabNav>
                        <TabNav value="adjustments">
                            Pending adjustments ({adjustments.length})
                        </TabNav>
                    </TabList>
                    <div className="mt-4">
                        <TabContent value="counts">
                            <DataTable
                                columns={countColumns}
                                data={counts}
                                loading={loading}
                            />
                        </TabContent>
                        <TabContent value="requests">
                            <DataTable
                                columns={requestColumns}
                                data={requests}
                                loading={loading}
                            />
                        </TabContent>
                        <TabContent value="adjustments">
                            <DataTable
                                columns={adjColumns}
                                data={adjustments}
                                loading={loading}
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AdjustmentApprovalPage
