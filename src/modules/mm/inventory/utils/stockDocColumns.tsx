'use client'

import type { ColumnDef } from '@/components/shared/DataTable'
import {
    fmtRcvDate,
    RcvAnimatedStatus,
    RcvDateCell,
    RcvDocNumberCell,
    RcvPlainCell,
    RcvQtyCell,
    rcvStatusTone,
} from '@/modules/mm/receiving/components/receivingTableUi'
import {
    InvAnimatedStatus,
    InvDateCell,
    InvDocNumberCell,
    InvPlainCell,
    InvQtyCell,
} from '../components/inventoryTableUi'
import { DocStatusBadge } from './inventoryUi'

/**
 * Shared columns for the stock-document lists (Goods Issue, Goods Receipt,
 * Inventory Adjustments, Transfers).
 *
 * All four show the same shape of business document, so they share the same
 * columns and the same status colours — the only difference is the one
 * "context" column each document has (issue purpose, supplier, reason).
 */

export type StockDocLike = {
    id: string
    documentNumber: string
    postingDate: string
    status: string
    createdAt: string
    lines?: unknown[]
}

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export type StockDocColumnConfig<T extends StockDocLike> = {
    /** The document's own context column (purpose / supplier / reason). */
    detail: {
        header: string
        value: (row: T) => string
        sub?: (row: T) => string | null | undefined
    }
    /** Warehouse label, if the document has one. */
    warehouse?: (row: T) => string | undefined
    /** Row actions (view / post / cancel …). */
    actions?: ColumnDef<T>[]
    /** Rich table styling (receiving hub vs inventory management). */
    presentation?: 'classic' | 'receiving' | 'inventory'
    docIcon?: 'gr' | 'gi' | 'adj' | 'xfer'
    onOpenDocument?: (row: T) => void
}

const GR_STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    SUBMITTED: 'info',
    VERIFIED: 'info',
    POSTED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

export const buildStockDocColumns = <T extends StockDocLike>(
    config: StockDocColumnConfig<T>,
): ColumnDef<T>[] => {
    const receiving = config.presentation === 'receiving'
    const inventory = config.presentation === 'inventory'
    const rich = receiving || inventory
    const docIcon = config.docIcon ?? 'gr'

    const columns: ColumnDef<T>[] = [
        {
            header: 'Document',
            cell: ({ row }) =>
                inventory ? (
                    <InvDocNumberCell
                        icon={docIcon}
                        primary={row.original.documentNumber}
                        secondary={fmtRcvDate(row.original.postingDate)}
                        onClick={
                            config.onOpenDocument
                                ? () => config.onOpenDocument!(row.original)
                                : undefined
                        }
                    />
                ) : receiving ? (
                    <RcvDocNumberCell
                        icon="gr"
                        primary={row.original.documentNumber}
                        secondary={fmtRcvDate(row.original.postingDate)}
                        onClick={
                            config.onOpenDocument
                                ? () => config.onOpenDocument!(row.original)
                                : undefined
                        }
                    />
                ) : (
                    <div className="min-w-[11rem]">
                        <div className="whitespace-nowrap font-mono text-xs font-semibold text-gray-900">
                            {row.original.documentNumber}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                            {fmtDate(row.original.postingDate)}
                        </div>
                    </div>
                ),
        },
        {
            header: config.detail.header,
            cell: ({ row }) =>
                rich ? (
                    <div className="min-w-[9rem] max-w-[12rem]">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {config.detail.value(row.original)}
                        </p>
                        {config.detail.sub?.(row.original) ? (
                            <p className="truncate text-[11px] text-gray-500">
                                {config.detail.sub(row.original)}
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <div className="min-w-[9rem] max-w-[11rem]">
                        <div className="truncate text-sm text-gray-700">
                            {config.detail.value(row.original)}
                        </div>
                        {config.detail.sub ? (
                            <div className="truncate text-[11px] text-gray-400">
                                {config.detail.sub(row.original)}
                            </div>
                        ) : null}
                    </div>
                ),
        },
    ]

    if (config.warehouse) {
        columns.push({
            header: 'Warehouse',
            cell: ({ row }) =>
                inventory ? (
                    <InvPlainCell>{config.warehouse!(row.original)}</InvPlainCell>
                ) : receiving ? (
                    <RcvPlainCell>{config.warehouse!(row.original)}</RcvPlainCell>
                ) : (
                    <div className="min-w-[8rem] max-w-[9rem] truncate whitespace-nowrap text-sm text-gray-600">
                        {config.warehouse!(row.original)}
                    </div>
                ),
        })
    }

    columns.push(
        {
            header: 'Lines',
            cell: ({ row }) =>
                inventory ? (
                    <InvQtyCell
                        value={row.original.lines?.length ?? 0}
                        label="Lines"
                    />
                ) : receiving ? (
                    <RcvQtyCell
                        value={row.original.lines?.length ?? 0}
                        label="Lines"
                    />
                ) : (
                    <span className="whitespace-nowrap text-sm tabular-nums text-gray-700">
                        {row.original.lines?.length ?? 0}
                    </span>
                ),
        },
        {
            header: 'Status',
            cell: ({ row }) =>
                inventory ? (
                    <InvAnimatedStatus status={row.original.status} />
                ) : receiving ? (
                    <RcvAnimatedStatus
                        status={row.original.status}
                        tone={rcvStatusTone(row.original.status, GR_STATUS_TONE)}
                    />
                ) : (
                    <DocStatusBadge status={row.original.status} />
                ),
        },
        {
            header: 'Created',
            cell: ({ row }) =>
                inventory ? (
                    <InvDateCell iso={row.original.createdAt} />
                ) : receiving ? (
                    <RcvDateCell iso={row.original.createdAt} />
                ) : (
                    <span className="whitespace-nowrap text-xs text-gray-500">
                        {fmtDate(row.original.createdAt)}
                    </span>
                ),
        },
    )

    if (config.actions?.length) columns.push(...config.actions)

    return columns
}
