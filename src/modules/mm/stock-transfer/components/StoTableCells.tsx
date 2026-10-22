'use client'

import {
    WmAnimatedStatus,
    WmDocNumberCell,
    WmProgressQtyCell,
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'
import Tag from '@/components/ui/Tag'
import { HiOutlineSwitchHorizontal } from 'react-icons/hi'
import type { StockTransferOrder } from '../types'
import { STO_STATUS_TONE } from './StoStatusTone'

export const stoTableRowEnterClass = wmTableRowEnterClass

export function StoOrderIdentityCell({
    orderNumber,
    transferType,
    onOpen,
}: {
    orderNumber: string
    transferType: string
    onOpen?: () => void
}) {
    const typeLabel = transferType.replaceAll('_', ' ')
    return (
        <div className="min-w-0">
            <WmDocNumberCell
                primary={orderNumber}
                secondary={typeLabel}
                icon="pick"
                onClick={onOpen}
            />
        </div>
    )
}

export function StoRouteCell({
    sourceCode,
    sourceName,
    destCode,
    destName,
}: {
    sourceCode?: string | null
    sourceName?: string | null
    destCode?: string | null
    destName?: string | null
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 text-sm">
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 ${wmIconPopClass(100)}`}
            >
                <HiOutlineSwitchHorizontal className="text-base" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                    <span className="font-mono text-xs text-gray-500">
                        {sourceCode ?? '—'}
                    </span>
                    <span className="mx-1 text-gray-300">→</span>
                    <span className="font-mono text-xs text-gray-500">
                        {destCode ?? '—'}
                    </span>
                </p>
                <p className="truncate text-[11px] text-gray-500">
                    {sourceName ?? 'Source'} → {destName ?? 'Destination'}
                </p>
            </div>
        </div>
    )
}

export function stoFulfillmentTotals(order: StockTransferOrder) {
    const lines = order.lines ?? []
    const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0)
    const dispatched = lines.reduce((s, l) => s + Number(l.dispatchedQty), 0)
    const received = lines.reduce((s, l) => s + Number(l.receivedQty), 0)
    const lineCount = lines.length
    return { totalQty, dispatched, received, lineCount }
}

export function StoFulfillmentCell({ order }: { order: StockTransferOrder }) {
    const { totalQty, dispatched, received, lineCount } =
        stoFulfillmentTotals(order)
    const inHistory =
        order.status === 'CLOSED' ||
        order.status === 'CANCELLED' ||
        order.status === 'FULLY_RECEIVED' ||
        order.status === 'PARTIALLY_RECEIVED'
    const done = inHistory ? received : dispatched
    const label = inHistory ? 'Received' : 'Dispatched'

    if (!lineCount) {
        return <span className="text-sm text-gray-400">No lines</span>
    }

    return (
        <div className="min-w-0">
            <Tag className="mb-1.5 border-gray-200 bg-gray-50 text-[10px] font-semibold dark:border-gray-600 dark:bg-gray-800/60">
                {lineCount} line{lineCount === 1 ? '' : 's'}
            </Tag>
            <WmProgressQtyCell
                done={done}
                total={totalQty || 1}
                label={label}
                tone="pick"
            />
        </div>
    )
}

export function StoStatusCell({ status }: { status: string }) {
    return (
        <WmAnimatedStatus
            status={status}
            tone={STO_STATUS_TONE[status] ?? 'default'}
        />
    )
}

export function StoCreatedCell({ createdAt }: { createdAt?: string | null }) {
    if (!createdAt) return <span className="text-sm text-gray-400">—</span>
    const d = new Date(createdAt)
    return (
        <div className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
            <p className="font-medium">
                {d.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                })}
            </p>
            <p className="text-gray-400">
                {d.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                })}
            </p>
        </div>
    )
}
