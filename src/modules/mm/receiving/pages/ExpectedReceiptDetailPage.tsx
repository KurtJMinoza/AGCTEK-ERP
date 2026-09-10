'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineInboxIn } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import ReceiveAgainstErDialog from '../components/ReceiveAgainstErDialog'
import type { MmExpectedReceipt, MmExpectedReceiptLine } from '../types'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const LIST_ROUTE = '/modules/mm/receiving/expected-receipts'
const GR_ROUTE = '/modules/mm/receiving/goods-receipt'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'info',
    IN_PROGRESS: 'warning',
    CLOSED: 'success',
    CANCELLED: 'danger',
    PARTIAL: 'warning',
    COMPLETE: 'success',
    SHORT: 'danger',
    OVER: 'warning',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ExpectedReceiptDetailPage = () => {
    const params = useParams()
    const id = params?.id as string

    const [er, setEr] = useState<MmExpectedReceipt | null>(null)
    const [loading, setLoading] = useState(true)
    const [receiveOpen, setReceiveOpen] = useState(false)
    const [lastGr, setLastGr] = useState<GoodsReceipt | null>(null)

    const fetchEr = useCallback(async () => {
        if (!id) return
        setLoading(true)
        try {
            setEr(await inboundService.getExpectedReceipt(id))
        } catch {
            setEr(null)
            pushToast('danger', 'Error', 'Failed to load expected receipt')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchEr() }, [fetchEr])

    const canReceive = er && !['CLOSED', 'CANCELLED'].includes(er.status)

    const lineColumns: ColumnDef<MmExpectedReceiptLine>[] = useMemo(() => [
        {
            header: 'Material',
            accessorKey: 'material.materialCode',
            cell: ({ row }) =>
                `${row.original.material?.materialCode ?? ''} — ${row.original.material?.materialName ?? row.original.materialId}`,
        },
        {
            header: 'Expected',
            accessorKey: 'expectedQuantity',
            cell: ({ row }) => Number(row.original.expectedQuantity),
        },
        {
            header: 'Received',
            accessorKey: 'receivedQuantity',
            cell: ({ row }) => Number(row.original.receivedQuantity),
        },
        {
            header: 'Damaged',
            accessorKey: 'damagedQuantity',
            cell: ({ row }) => Number(row.original.damagedQuantity),
        },
        {
            header: 'UOM',
            accessorKey: 'uom.code',
            cell: ({ row }) => row.original.uom?.code ?? '—',
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
    ], [])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`${LIST_ROUTE}/${id}`, {
                detailLabel: er?.documentNumber,
            }),
        [id, er?.documentNumber],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex justify-center py-16"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!er) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <PageHeader title="Expected receipt not found" />
                <Link href={LIST_ROUTE} className="text-primary hover:underline">Back to list</Link>
            </PageContainer>
        )
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={er.documentNumber}
                description={`${er.sourceType} inbound · ${er.supplier?.supplierName ?? er.supplierId}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={STATUS_TONE[er.status] ?? 'default'}>{er.status}</StatusBadge>
                        {canReceive ? (
                            <Button variant="solid" icon={<HiOutlineInboxIn />} onClick={() => setReceiveOpen(true)}>
                                Receive
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AdaptiveCard>
                    <p className="text-xs text-gray-500">Supplier</p>
                    <p className="font-medium">{er.supplier?.supplierName ?? '—'}</p>
                    <p className="text-xs text-gray-400">{er.supplier?.supplierCode}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-xs text-gray-500">Purchase order</p>
                    <p className="font-medium">{er.purchaseOrder?.poNumber ?? '—'}</p>
                    {er.asn?.asnNumber ? (
                        <p className="text-xs text-gray-400">ASN {er.asn.asnNumber}</p>
                    ) : null}
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-xs text-gray-500">Warehouse</p>
                    <p className="font-medium">{er.warehouse?.name ?? '—'}</p>
                </AdaptiveCard>
                <AdaptiveCard>
                    <p className="text-xs text-gray-500">Expected date</p>
                    <p className="font-medium">{fmtDate(er.expectedDate)}</p>
                </AdaptiveCard>
            </div>

            {(lastGr || (er.goodsReceipts?.length ?? 0) > 0) ? (
                <AdaptiveCard className="mb-4">
                    <h6 className="mb-2">Linked goods receipts</h6>
                    <ul className="space-y-1 text-sm">
                        {lastGr ? (
                            <li>
                                <Link href={GR_ROUTE} className="text-primary hover:underline">
                                    {lastGr.documentNumber}
                                </Link>
                                {' '}
                                <StatusBadge tone="default">{lastGr.status}</StatusBadge>
                                <span className="ml-2 text-xs text-gray-400">(just created)</span>
                            </li>
                        ) : null}
                        {(er.goodsReceipts ?? [])
                            .filter((g) => g.id !== lastGr?.id)
                            .map((g) => (
                                <li key={g.id}>
                                    <span className="font-medium">{g.documentNumber}</span>
                                    {' '}
                                    <StatusBadge tone={STATUS_TONE[g.status] ?? 'default'}>{g.status}</StatusBadge>
                                </li>
                            ))}
                    </ul>
                </AdaptiveCard>
            ) : null}

            <AdaptiveCard>
                <h6 className="mb-3">Lines</h6>
                <DataTable columns={lineColumns} data={er.lines ?? []} />
            </AdaptiveCard>

            <ReceiveAgainstErDialog
                isOpen={receiveOpen}
                expectedReceipt={er}
                onClose={() => setReceiveOpen(false)}
                onSuccess={(gr) => {
                    setLastGr(gr)
                    fetchEr()
                }}
            />
        </PageContainer>
    )
}

export default ExpectedReceiptDetailPage
