'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
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
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

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
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE_PATH)

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
            header: 'PO Number',
            accessorKey: 'poNumber',
            size: 140,
            cell: ({ row }) => (
                <button
                    type="button"
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    onClick={() => router.push(`${PO_DETAIL}/${row.original.id}`)}
                >
                    {row.original.poNumber}
                </button>
            ),
        },
        {
            header: 'Supplier',
            id: 'supplier',
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.supplier
                        ? `${row.original.supplier.supplierCode} — ${row.original.supplier.supplierName}`
                        : row.original.supplierId}
                </span>
            ),
        },
        {
            header: 'Buyer',
            accessorKey: 'buyerId',
            cell: ({ row }) => <span className="text-sm">{row.original.buyerId}</span>,
        },
        {
            header: 'Total',
            id: 'total',
            cell: ({ row }) => (
                <span className="text-sm font-semibold">
                    {Number(row.original.totalAmount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </span>
            ),
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: () => (
                <StatusBadge tone="warning">PENDING APPROVAL</StatusBadge>
            ),
        },
        {
            header: 'Submitted',
            accessorKey: 'submittedAt',
            cell: ({ row }) => (
                <span className="text-xs">
                    {row.original.submittedAt
                        ? new Date(row.original.submittedAt).toLocaleString()
                        : '—'}
                </span>
            ),
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
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="PO Approvals"
                description="Purchase orders awaiting approval decision."
            />

            <AdaptiveCard className="mt-4">
                <DataTable<MmPurchaseOrder>
                    columns={columns}
                    data={data}
                    compact
                    fit
                    loading={loading}
                    noData={!loading && data.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => { setPageSize(size); setPage(1) }}
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
