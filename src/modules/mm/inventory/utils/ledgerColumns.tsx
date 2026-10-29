'use client'

import type { ColumnDef } from '@/components/shared/DataTable'
import type { InventoryTransaction } from '../services/inventoryService'
import {
    idTail,
    movementLabel,
    movementTone,
    reasonLabel,
    signedQty,
    sourceLabel,
} from './ledgerLabels'
import {
    ActorCell,
    ReferenceDot,
    RetrySafeChip,
    TONE_CARD,
} from './inventoryUi'
import { InvDocNumberCell, InvPlainCell } from '../components/inventoryTableUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'

/**
 * The transaction table columns shared by every Inventory Management page that
 * shows ledger postings (Inventory Ledger, Stock Movements, Traceability).
 *
 * Keeping them in one place is what makes the sub-modules look and read the
 * same: one movement vocabulary, one reference treatment, one document-number
 * typography, one idempotency marker.
 */

export const TRANSACTION_COLUMN_KEYS = [
    'transaction',
    'movement',
    'material',
    'location',
    'quantity',
    'reference',
    'reverses',
    'postedBy',
    'idempotency',
] as const

export type TransactionColumnKey = (typeof TRANSACTION_COLUMN_KEYS)[number]

const num = (v: string | number | undefined) => Number(v ?? 0)

export type TransactionColumnOptions = {
    presentation?: 'classic' | 'inventory'
}

export const buildTransactionColumns = (
    keys: readonly TransactionColumnKey[] = TRANSACTION_COLUMN_KEYS,
    options?: TransactionColumnOptions,
): ColumnDef<InventoryTransaction>[] => {
    const inventory = options?.presentation === 'inventory'

    const defs: Record<TransactionColumnKey, ColumnDef<InventoryTransaction>> = {
        transaction: {
            header: 'Transaction',
            cell: ({ row }) => {
                const t = row.original
                const isReversal = !!t.reversalOfId
                const secondary = [
                    isReversal ? 'Reversal' : t.reversedBy ? 'Reversed' : null,
                    t.postingDate,
                ]
                    .filter(Boolean)
                    .join(' · ')
                if (inventory) {
                    return (
                        <InvDocNumberCell
                            icon="ledger"
                            primary={t.transactionNumber}
                            secondary={secondary || undefined}
                        />
                    )
                }
                return (
                    <div className="min-w-[10rem]">
                        <div className="whitespace-nowrap font-mono text-xs font-semibold text-gray-900">
                            {t.transactionNumber}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                            {isReversal ? (
                                <span className="font-medium text-amber-600">
                                    Reversal
                                </span>
                            ) : t.reversedBy ? (
                                <span className="font-medium text-rose-500">
                                    Reversed
                                </span>
                            ) : null}
                            <span>
                                {new Date(t.postingDate).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                )
            },
        },
        movement: {
            header: 'Movement',
            cell: ({ row }) => {
                const t = row.original
                const isReversal = !!t.reversalOfId
                const tone = isReversal
                    ? 'warning'
                    : movementTone(t.movementType, t.signedQuantity)
                const reason = t.reasonCode ? reasonLabel(t.reasonCode) : ''
                const original = t.reversalOf?.movementType
                    ? movementLabel(t.reversalOf.movementType)
                    : ''
                return (
                    <div className="min-w-[9rem] max-w-[10rem]">
                        <span
                            className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${TONE_CARD[tone]}`}
                        >
                            {isReversal
                                ? 'Reversal'
                                : movementLabel(t.movementType)}
                        </span>
                        {isReversal ? (
                            <div
                                className="mt-1 truncate text-[11px] text-gray-500"
                                title={[original, reason]
                                    .filter(Boolean)
                                    .join(' · ')}
                            >
                                {original ? `of ${original}` : ''}
                                {original && reason ? ' · ' : ''}
                                {reason}
                            </div>
                        ) : reason ? (
                            <div className="mt-1 truncate text-[11px] text-gray-500">
                                {reason}
                            </div>
                        ) : null}
                    </div>
                )
            },
        },
        material: {
            header: 'Material',
            cell: ({ row }) => {
                const m = row.original.material
                if (inventory) {
                    return (
                        <SmEntityCell
                            kind="material"
                            primary={m?.materialName}
                            secondary={m?.materialCode ?? row.original.materialId.slice(0, 8)}
                        />
                    )
                }
                return (
                    <div className="min-w-[11rem] max-w-[12rem]">
                        <div className="truncate font-semibold text-gray-900">
                            {m?.materialCode ?? row.original.materialId.slice(0, 8)}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                            {m?.materialName ?? '—'}
                        </div>
                    </div>
                )
            },
        },
        location: {
            header: 'Location',
            cell: ({ row }) =>
                inventory ? (
                    <div className="min-w-[8rem]">
                        <InvPlainCell>{row.original.warehouse?.code ?? row.original.warehouseId.slice(0, 8)}</InvPlainCell>
                        <InvPlainCell mono muted>
                            {row.original.storageBin?.code ?? 'No bin'}
                        </InvPlainCell>
                    </div>
                ) : (
                    <div className="min-w-[8rem] max-w-[8rem] whitespace-nowrap text-sm text-gray-600">
                        <div className="truncate">
                            {row.original.warehouse?.code ??
                                row.original.warehouseId.slice(0, 8)}
                        </div>
                        <div className="truncate font-mono text-xs text-gray-400">
                            {row.original.storageBin?.code ?? 'No bin'}
                        </div>
                    </div>
                ),
        },
        quantity: {
            header: 'Quantity',
            cell: ({ row }) => {
                const t = row.original
                const tone = movementTone(t.movementType, t.signedQuantity)
                return (
                    <div className="whitespace-nowrap text-right">
                        <div
                            className={`font-semibold ${
                                tone === 'inbound'
                                    ? 'text-emerald-600'
                                    : tone === 'outbound'
                                      ? 'text-rose-600'
                                      : 'text-gray-900'
                            }`}
                        >
                            {signedQty(t.signedQuantity, t.quantity)}{' '}
                            <span className="text-xs font-normal text-gray-500">
                                {t.uom?.code ?? ''}
                            </span>
                        </div>
                        <div className="text-[11px] text-gray-400">
                            base {num(t.baseQuantity ?? t.quantity)}
                        </div>
                    </div>
                )
            },
        },
        reference: {
            header: 'Reference',
            cell: ({ row }) => {
                const t = row.original
                const tone = movementTone(t.movementType, t.signedQuantity)
                const resolved = t.sourceReference
                const raw = idTail(t.sourceDocumentId)
                return (
                    <div
                        className="min-w-[9.5rem] max-w-[10rem]"
                        title={
                            t.sourceDocumentId
                                ? `${t.sourceDocumentType ?? 'source'} · ${t.sourceDocumentId}`
                                : undefined
                        }
                    >
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <ReferenceDot tone={tone} />
                            <span className="min-w-0 truncate">
                                {sourceLabel(t.sourceDocumentType)}
                            </span>
                        </div>
                        {resolved ? (
                            <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[11px] font-medium text-gray-600">
                                {resolved}
                            </div>
                        ) : raw ? (
                            <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[11px] text-gray-400">
                                …{raw}
                            </div>
                        ) : null}
                    </div>
                )
            },
        },
        reverses: {
            header: 'Reverses',
            cell: ({ row }) => {
                const t = row.original
                if (!t.reversalOfId) {
                    return <span className="text-sm text-gray-300">—</span>
                }
                return (
                    <div className="min-w-[9rem]">
                        <div className="truncate whitespace-nowrap font-mono text-xs font-medium text-amber-700 dark:text-amber-300">
                            {t.reversalOf?.transactionNumber ??
                                `…${idTail(t.reversalOfId)}`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                            original posting
                        </div>
                    </div>
                )
            },
        },
        postedBy: {
            header: 'Posted by',
            cell: ({ row }) => <ActorCell createdBy={row.original.createdBy} />,
        },
        idempotency: {
            header: 'Idempotency',
            cell: ({ row }) => (
                <RetrySafeChip idempotencyKey={row.original.idempotencyKey} />
            ),
        },
    }

    return keys.map((key) => defs[key])
}
