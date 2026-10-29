'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProcurementResponsiveTable, { type ColumnDef } from '../components/ProcurementResponsiveTable'
import {
    PrcAnimatedStatus,
    PrcDateCell,
    PrcDocNumberCell,
    PrcMoneyCell,
    PrcPlainCell,
    PrcSupplierCell,
    PRC_PO_STATUS,
    prcStatusTone,
} from '../components/procurementTableUi'
import { procurementParentBreadcrumbs } from '../utils/procurementPageUi'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineEye,
} from 'react-icons/hi'
import { purchaseOrderService } from '../services/purchaseOrderService'
import type { MmPurchaseOrder, PoListResponse } from '../types'

const ROUTE_PATH = '/modules/mm/procurement/po-approvals'
const PO_DETAIL = '/modules/mm/procurement/purchase-orders'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const PoApprovalsPage = () => {
    const router = useRouter()
    const parentBreadcrumbs = procurementParentBreadcrumbs(ROUTE_PATH)

    const [data, setData] = useState<MmPurchaseOrder[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    const [confirmAction, setConfirmAction] = useState<{
        action: string
        fn: () => Promise<void>
    } | null>(null)
    const [confirming, setConfirming] = useState(false)

    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectPoId, setRejectPoId] = useState('')
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res: PoListResponse = await purchaseOrderService.list({
                status: 'PENDING_APPROVAL',
                page,
                pageSize,
            })
            setData(res.data)
            setTotal(res.total)
        } catch {
            setData([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }, [page, pageSize])

    useEffect(() => { fetchData() }, [fetchData])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchData()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchData])

    const handleReject = async () => {
        if (!rejectPoId) return
        setRejecting(true)
        try {
            await purchaseOrderService.reject(rejectPoId, rejectReason || 'Rejected')
            pushToast('success', 'Rejected', 'Purchase order rejected.')
            setRejectOpen(false)
            fetchData()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Reject failed')
        } finally {
            setRejecting(false)
        }
    }

    const columns = useMemo<ColumnDef<MmPurchaseOrder>[]>(() => [
        {
            header: 'Purchase order',
            accessorKey: 'poNumber',
            size: 180,
            cell: ({ row }) => (
                <PrcDocNumberCell
                    icon="po"
                    primary={row.original.poNumber}
                    secondary={row.original.supplier?.supplierName}
                    onClick={() => router.push(`${PO_DETAIL}/${row.original.id}`)}
                />
            ),
        },
        {
            header: 'Supplier',
            id: 'supplier',
            cell: ({ row }) => (
                <PrcSupplierCell
                    code={row.original.supplier?.supplierCode}
                    name={row.original.supplier?.supplierName ?? row.original.supplierId}
                />
            ),
        },
        {
            header: 'Buyer',
            accessorKey: 'buyerId',
            cell: ({ row }) => <PrcPlainCell mono>{row.original.buyerId}</PrcPlainCell>,
        },
        {
            header: 'Total',
            id: 'total',
            cell: ({ row }) => (
                <PrcMoneyCell
                    amount={row.original.totalAmount}
                    currency={row.original.currency?.code}
                />
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <PrcAnimatedStatus
                    status={row.original.status}
                    tone={prcStatusTone(row.original.status, PRC_PO_STATUS)}
                />
            ),
        },
        {
            header: 'Submitted',
            accessorKey: 'submittedAt',
            cell: ({ row }) => <PrcDateCell iso={row.original.submittedAt} />,
        },
        {
            id: 'actions',
            header: 'Actions',
            size: 220,
            cell: ({ row }) => {
                const po = row.original
                return (
                    <div className="flex flex-wrap gap-1">
                        <Button
                            size="xs"
                            icon={<HiOutlineEye />}
                            onClick={() => router.push(`${PO_DETAIL}/${po.id}`)}
                        >
                            View
                        </Button>
                        <Button
                            size="xs"
                            variant="solid"
                            icon={<HiOutlineCheckCircle />}
                            onClick={() => setConfirmAction({
                                action: 'Approve',
                                fn: async () => { await purchaseOrderService.approve(po.id) },
                            })}
                        >
                            Approve
                        </Button>
                        <Button
                            size="xs"
                            icon={<HiOutlineXCircle />}
                            onClick={() => {
                                setRejectPoId(po.id)
                                setRejectReason('')
                                setRejectOpen(true)
                            }}
                        >
                            Reject
                        </Button>
                    </div>
                )
            },
        },
    ], [router])

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="PO Approvals"
                description="Purchase orders awaiting approval decision."
            />

            <AdaptiveCard className="mt-4">
                <ProcurementResponsiveTable<MmPurchaseOrder>
                    columns={columns}
                    data={data}
                    compact
                    loading={loading}
                    getRowId={(row) => row.id}
                    noData={!loading && data.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => { setPageSize(size); setPage(1) }}
                    tableMinWidthClass="min-w-[980px]"
                />
            </AdaptiveCard>

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                type="success"
                title={`${confirmAction?.action ?? 'Confirm'}?`}
                confirmText={confirmAction?.action ?? 'Confirm'}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={runConfirm}
                confirmButtonProps={{ loading: confirming }}
            >
                <p>Approve this purchase order?</p>
            </ConfirmDialog>

            <FormDialog
                isOpen={rejectOpen}
                onClose={() => setRejectOpen(false)}
                title="Reject Purchase Order"
                width={480}
                footer={
                    <>
                        <Button size="sm" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={rejecting} onClick={handleReject}>
                            Reject
                        </Button>
                    </>
                }
            >
                <FormItem label="Reason">
                    <Input
                        textArea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Rejection reason"
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default PoApprovalsPage
