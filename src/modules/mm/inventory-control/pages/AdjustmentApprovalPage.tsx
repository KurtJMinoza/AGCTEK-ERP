'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import InventoryControlResponsiveTable, {
    type ColumnDef,
} from '../components/InventoryControlResponsiveTable'
import {
    IC_COUNT_STATUS,
    IcAnimatedStatus,
    IcDocCell,
    IcMethodTag,
    IcPartyCell,
    IcPlainCell,
    icStatusTone,
} from '../components/inventoryControlTableUi'
import { inventoryControlParentBreadcrumbs } from '../utils/inventoryControlPageUi'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import { adjustmentService } from '../../inventory/services/adjustmentService'
import type { InventoryCount, CountAdjustmentRequest } from '../types'
import type { InventoryAdjustment } from '../../inventory/types'

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
    const parentBreadcrumbs = inventoryControlParentBreadcrumbs(ROUTE)
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
            {
                header: 'Count',
                cell: ({ row }) => (
                    <IcDocCell
                        primary={row.original.countNumber}
                        secondary={row.original.countType}
                    />
                ),
            },
            {
                header: 'Type',
                cell: ({ row }) => (
                    <IcMethodTag label={row.original.countType} />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <IcPartyCell kind="warehouse" name={row.original.warehouse?.name} />
                ),
            },
            {
                header: 'Adjustment',
                cell: ({ row }) =>
                    row.original.adjustment ? (
                        <IcPlainCell mono>
                            {`${row.original.adjustment.documentNumber} (${row.original.adjustment.status})`}
                        </IcPlainCell>
                    ) : (
                        <IcPlainCell muted>—</IcPlainCell>
                    ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <IcAnimatedStatus
                        status={row.original.status}
                        tone={icStatusTone(row.original.status, IC_COUNT_STATUS)}
                    />
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
            {
                header: 'Document',
                cell: ({ row }) => (
                    <IcDocCell
                        icon="variance"
                        primary={row.original.documentNumber}
                        secondary={row.original.adjustmentReason}
                    />
                ),
            },
            {
                header: 'Reason',
                cell: ({ row }) => (
                    <IcMethodTag label={row.original.adjustmentReason} />
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <IcAnimatedStatus status={row.original.status} tone="warning" />
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
            {
                header: 'Request',
                cell: ({ row }) => (
                    <IcDocCell primary={row.original.requestNumber} icon="variance" />
                ),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <IcPartyCell kind="warehouse" name={row.original.warehouse?.code} />
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <IcAnimatedStatus status={row.original.status} tone="warning" />
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
            <PageHeader
                title="Adjustment Approval"
                description="Approve count adjustment requests before inventory posting."
                breadcrumbs={parentBreadcrumbs}
                actions={<Button onClick={load}>Refresh</Button>}
            />
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
                            <InventoryControlResponsiveTable
                                columns={countColumns}
                                data={counts}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[980px]"
                            />
                        </TabContent>
                        <TabContent value="requests">
                            <InventoryControlResponsiveTable
                                columns={requestColumns}
                                data={requests}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[880px]"
                            />
                        </TabContent>
                        <TabContent value="adjustments">
                            <InventoryControlResponsiveTable
                                columns={adjColumns}
                                data={adjustments}
                                loading={loading}
                                getRowId={(row) => row.id}
                                tableMinWidthClass="min-w-[720px]"
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AdjustmentApprovalPage
