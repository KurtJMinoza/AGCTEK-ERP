'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import StatusBadge from '@/components/shared/StatusBadge'
import Spinner from '@/components/ui/Spinner'
import { documentFlowService } from '@/modules/mm/shared/services/documentFlowService'
import type { DocumentFlowNode } from '@/modules/mm/shared/types/documentFlow'

const TYPE_LABELS: Record<string, string> = {
    PURCHASE_REQUISITION: 'Purchase Requisition',
    RFQ: 'RFQ',
    QUOTATION: 'Quotation',
    PURCHASE_ORDER: 'Purchase Order',
    ASN: 'ASN',
    EXPECTED_RECEIPT: 'Expected Receipt',
    RECEIVING_DOCUMENT: 'Receiving',
    GOODS_RECEIPT: 'Goods Receipt',
    INSPECTION_LOT: 'Inspection Lot',
    QUALITY_DECISION: 'Quality Decision',
    PUTAWAY_TASK: 'Putaway',
    RESERVATION: 'Reservation',
    ALLOCATION: 'Allocation',
    PICK_TASK: 'Pick Task',
    PACK_SESSION: 'Pack Session',
    GOODS_ISSUE: 'Goods Issue',
    STO: 'Transfer Order',
    TRANSFER_SHIPMENT: 'Dispatch',
    TRANSFER_RECEIPT: 'Transfer Receipt',
    INVENTORY_TRANSACTION: 'Inventory Transaction',
    ACCOUNTING_EVENT: 'Accounting Event',
}

const TYPE_ROUTES: Record<string, (id: string) => string | undefined> = {
    PURCHASE_REQUISITION: (id) => `/modules/mm/procurement/purchase-requisitions/${id}`,
    RFQ: (id) => `/modules/mm/procurement/rfqs/${id}`,
    QUOTATION: (id) => `/modules/mm/procurement/supplier-quotations?quotationId=${id}`,
    PURCHASE_ORDER: (id) => `/modules/mm/procurement/purchase-orders/${id}`,
    ASN: () => `/modules/mm/receiving/expected-receipts`,
    EXPECTED_RECEIPT: (id) => `/modules/mm/receiving/expected-receipts/${id}`,
    RECEIVING_DOCUMENT: () => `/modules/mm/receiving/expected-receipts`,
    GOODS_RECEIPT: () => `/modules/mm/inventory-management/goods-receipt`,
    INSPECTION_LOT: (id) => `/modules/mm/receiving/inspection-lots/${id}`,
    QUALITY_DECISION: (id) => `/modules/mm/receiving/inspection-lots/${id}`,
    PUTAWAY_TASK: () => `/modules/mm/warehouse-management/my-tasks`,
    RESERVATION: () => `/modules/mm/inventory-management/reservations`,
    ALLOCATION: () => `/modules/mm/inventory-management/reservations`,
    PICK_TASK: () => `/modules/mm/warehouse-management/my-tasks`,
    PACK_SESSION: () => `/modules/mm/warehouse-management/packing`,
    GOODS_ISSUE: () => `/modules/mm/inventory-management/goods-issue`,
    STO: () => `/modules/mm/inventory-management/stock-transfers`,
    TRANSFER_SHIPMENT: () => `/modules/mm/warehouse-management/in-transit`,
    TRANSFER_RECEIPT: () => `/modules/mm/warehouse-management/transfer-receipts`,
    INVENTORY_TRANSACTION: () => `/modules/mm/inventory-management/inventory-ledger`,
    ACCOUNTING_EVENT: () => undefined,
}

function fmtDate(iso: string) {
    try {
        return new Date(iso).toLocaleString()
    } catch {
        return iso
    }
}

function FlowNodeRow({
    node,
    highlight,
}: {
    node: DocumentFlowNode
    highlight?: boolean
}) {
    const label = TYPE_LABELS[node.documentType] ?? node.documentType
    const href = TYPE_ROUTES[node.documentType]?.(node.documentId)

    return (
        <li
            className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                highlight
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 dark:border-gray-700'
            }`}
        >
            <span className="font-medium text-gray-700 dark:text-gray-200">{label}</span>
            {href ? (
                <Link href={href} className="text-primary hover:underline">
                    {node.displayNumber}
                </Link>
            ) : (
                <span>{node.displayNumber}</span>
            )}
            <StatusBadge status={node.status} />
            <span className="text-xs text-gray-500">{fmtDate(node.createdAt)}</span>
        </li>
    )
}

export type DocumentFlowTimelineProps = {
    documentType: string
    documentId: string
    companyId?: string
    className?: string
}

export default function DocumentFlowTimeline({
    documentType,
    documentId,
    companyId,
    className,
}: DocumentFlowTimelineProps) {
    const [flow, setFlow] = useState<Awaited<ReturnType<typeof documentFlowService.getFlow>> | null>(
        null,
    )
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        documentFlowService
            .getFlow(documentType, documentId, companyId)
            .then((data) => {
                if (!cancelled) setFlow(data)
            })
            .catch(() => {
                if (!cancelled) {
                    setFlow(null)
                    setError('Unable to load document flow')
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [documentType, documentId, companyId])

    if (loading) {
        return (
            <div className={`flex items-center gap-2 text-sm text-gray-500 ${className ?? ''}`}>
                <Spinner size={18} />
                Loading document flow…
            </div>
        )
    }

    if (error || !flow) {
        return <p className={`text-sm text-gray-500 ${className ?? ''}`}>{error ?? 'No flow data'}</p>
    }

    return (
        <div className={`space-y-4 ${className ?? ''}`}>
            {flow.upstream.length > 0 && (
                <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Upstream
                    </h4>
                    <ul className="space-y-2">
                        {flow.upstream.map((node) => (
                            <FlowNodeRow key={`${node.documentType}:${node.documentId}`} node={node} />
                        ))}
                    </ul>
                </section>
            )}

            <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Current
                </h4>
                <ul className="space-y-2">
                    <FlowNodeRow node={flow.current} highlight />
                </ul>
            </section>

            {flow.downstream.length > 0 && (
                <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Downstream
                    </h4>
                    <ul className="space-y-2">
                        {flow.downstream.map((node) => (
                            <FlowNodeRow key={`${node.documentType}:${node.documentId}`} node={node} />
                        ))}
                    </ul>
                </section>
            )}

            {flow.upstream.length === 0 && flow.downstream.length === 0 && (
                <p className="text-sm text-gray-500">No linked documents in this chain yet.</p>
            )}
        </div>
    )
}
