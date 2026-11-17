'use client'

import {
    WmAnimatedStatus,
    WmDocNumberCell,
    WmProgressQtyCell,
    wmTableRowEnterClass,
} from './WarehouseTableCells'
import Tag from '@/components/ui/Tag'
import type { WarehouseTransfer } from '../types'

export const wmTransferRowEnterClass = wmTableRowEnterClass

export const WM_TRANSFER_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger'
> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    READY_TO_PICK: 'warning',
    PICKED: 'success',
    DISPATCHED: 'warning',
    IN_TRANSIT: 'warning',
    PARTIALLY_RECEIVED: 'warning',
    RECEIVED: 'success',
    PUTAWAY: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
}

export function WmTransferIdentityCell({
    transferNumber,
    lineCount,
    onOpen,
}: {
    transferNumber: string
    lineCount: number
    onOpen?: () => void
}) {
    return (
        <WmDocNumberCell
            primary={transferNumber}
            secondary={`${lineCount} line${lineCount === 1 ? '' : 's'}`}
            icon="pick"
            onClick={onOpen}
        />
    )
}

export function WmTransferRouteCell({
    source,
    destination,
}: {
    source?: { code?: string; name?: string } | null
    destination?: { code?: string; name?: string } | null
}) {
    return (
        <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                <span className="font-mono text-xs text-gray-500">
                    {source?.code ?? '—'}
                </span>
                <span className="mx-1 text-gray-300">→</span>
                <span className="font-mono text-xs text-gray-500">
                    {destination?.code ?? '—'}
                </span>
            </p>
            <p className="truncate text-[11px] text-gray-500">
                {source?.name ?? 'Source'} → {destination?.name ?? 'Dest'}
            </p>
        </div>
    )
}

export function wmTransferStatusTone(status: string) {
    return WM_TRANSFER_TONE[status] ?? 'default'
}

export function wmTransferProgressText(transfer: WarehouseTransfer): string {
    const { total, done, label } = transferProgress(transfer)
    if (!total) return '—'
    return `${label} ${done.toLocaleString()} / ${total.toLocaleString()}`
}

function transferProgress(transfer: WarehouseTransfer) {
    const lines = transfer.lines ?? []
    const total = lines.reduce((s, l) => s + Number(l.quantity), 0)
    const picked = lines.reduce((s, l) => s + Number(l.pickedQty), 0)
    const received = lines.reduce((s, l) => s + Number(l.receivedQty), 0)
    const receiptPhase = [
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'PUTAWAY',
        'COMPLETED',
    ].includes(transfer.status)
    const done = receiptPhase ? received : picked
    const label = receiptPhase ? 'Received' : 'Picked'
    return { total, done, label }
}

export function WmTransferProgressCell({
    transfer,
}: {
    transfer: WarehouseTransfer
}) {
    const { total, done, label } = transferProgress(transfer)
    if (!total) return <span className="text-sm text-gray-400">—</span>
    return (
        <WmProgressQtyCell
            done={done}
            total={total}
            label={label}
            tone="pack"
        />
    )
}

export function WmTransferStatusCell({ status }: { status: string }) {
    return (
        <WmAnimatedStatus
            status={status}
            tone={WM_TRANSFER_TONE[status] ?? 'default'}
        />
    )
}

export function WmTransferMetaCell({
    requestedBy,
    createdAt,
}: {
    requestedBy?: string | null
    createdAt?: string
}) {
    const d = createdAt ? new Date(createdAt) : null
    return (
        <div className="min-w-0 text-xs">
            <p className="truncate font-medium text-gray-800 dark:text-gray-200">
                {requestedBy?.trim() || '—'}
            </p>
            {d && !Number.isNaN(d.getTime()) ? (
                <p className="text-gray-400">
                    {d.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    })}
                </p>
            ) : null}
        </div>
    )
}

export function WmTransferRequesterChip({
    requestedBy,
}: {
    requestedBy?: string | null
}) {
    if (!requestedBy?.trim()) {
        return <Tag className="text-[11px] text-gray-500">No requester</Tag>
    }
    return (
        <Tag className="max-w-[8rem] truncate border-gray-200 bg-gray-50 text-[11px] font-medium dark:border-gray-600 dark:bg-gray-800/60">
            {requestedBy}
        </Tag>
    )
}
