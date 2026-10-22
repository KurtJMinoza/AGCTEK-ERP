'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import {
    HiOutlineArchive,
    HiOutlineLocationMarker,
    HiOutlineViewBoards,
    HiOutlineViewGrid,
} from 'react-icons/hi'
import {
    WmAnimatedStatus,
    WmProgressQtyCell,
    wmIconPopClass,
    wmTableRowEnterClass,
} from './WarehouseTableCells'

export const storageTableRowEnterClass = wmTableRowEnterClass

export function WmStorageSectionCell({
    code,
    name,
    description,
}: {
    code: string
    name: string
    description?: string | null
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${wmIconPopClass(90)}`}
            >
                <HiOutlineViewGrid className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {name}
                </p>
                <p className="truncate font-mono text-[11px] text-primary">
                    {code}
                </p>
                {description ? (
                    <p className="truncate text-[11px] text-gray-500">
                        {description}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function WmStorageTypeRefCell({
    typeCode,
    typeName,
    warehouseName,
}: {
    typeCode?: string | null
    typeName?: string | null
    warehouseName?: string | null
}) {
    if (!typeCode && !typeName) {
        return <span className="text-sm text-gray-400">—</span>
    }
    return (
        <div className="min-w-0">
            <p className="truncate text-sm text-gray-900 dark:text-gray-100">
                {typeName ?? typeCode}
            </p>
            <p className="truncate text-[11px] text-gray-500">
                {typeCode ? (
                    <span className="font-mono">{typeCode}</span>
                ) : null}
                {warehouseName ? (
                    <>
                        {typeCode ? ' · ' : ''}
                        {warehouseName}
                    </>
                ) : null}
            </p>
        </div>
    )
}

export function WmStorageStatusCell({ status }: { status: string }) {
    const tone =
        status === 'ACTIVE'
            ? 'success'
            : status === 'INACTIVE'
              ? 'warning'
              : 'default'
    if (status === 'ACTIVE') {
        return <WmAnimatedStatus status={status} tone={tone} />
    }
    return (
        <StatusBadge tone={tone}>{status.replaceAll('_', ' ')}</StatusBadge>
    )
}

export function WmStorageBinCell({
    code,
    barcode,
}: {
    code: string
    barcode?: string | null
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep shadow-sm ring-1 ring-primary/10 dark:bg-primary/15 dark:text-primary-light dark:ring-primary/20 ${wmIconPopClass(90)}`}
            >
                <HiOutlineViewBoards className="text-lg" />
            </span>
            <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-primary">
                    {code}
                </p>
                {barcode?.trim() ? (
                    <p className="truncate font-mono text-[11px] text-gray-500">
                        {barcode}
                    </p>
                ) : (
                    <p className="text-[11px] text-gray-400">No barcode</p>
                )}
            </div>
        </div>
    )
}

export function WmBinLocationCell({
    sectionCode,
    sectionName,
    shelfCode,
    warehouseName,
    typeName,
}: {
    sectionCode?: string | null
    sectionName?: string | null
    shelfCode?: string | null
    warehouseName?: string | null
    typeName?: string | null
}) {
    const sectionLabel = sectionCode ?? sectionName ?? '—'
    return (
        <div className="flex min-w-0 items-start gap-2">
            <HiOutlineLocationMarker className="mt-0.5 shrink-0 text-base text-primary transition-transform duration-200 group-hover/row:scale-110" />
            <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {sectionLabel}
                    {shelfCode ? (
                        <span className="font-normal text-gray-400">
                            {' '}
                            / {shelfCode}
                        </span>
                    ) : null}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                    {typeName ?? 'Storage area'}
                    {warehouseName ? ` · ${warehouseName}` : ''}
                </p>
            </div>
        </div>
    )
}

export function WmBinCapacityCell({
    capacityQuantity,
    capacityWeight,
    weightUom,
    currentQuantity,
    utilizationPct,
}: {
    capacityQuantity: number
    capacityWeight: number
    weightUom?: string | null
    currentQuantity?: number
    utilizationPct?: number
}) {
    const cap = Math.max(Number(capacityQuantity) || 0, 0)
    const current = Math.max(Number(currentQuantity) || 0, 0)
    const pct =
        utilizationPct != null && Number.isFinite(utilizationPct)
            ? Math.min(100, Math.max(0, utilizationPct))
            : cap > 0
              ? Math.min(100, (current / cap) * 100)
              : 0

    return (
        <div className="min-w-[5.5rem]">
            {cap > 0 ? (
                <WmProgressQtyCell
                    done={current}
                    total={cap}
                    label="Fill"
                    tone="pack"
                />
            ) : (
                <p className="text-xs text-gray-400">No qty cap</p>
            )}
            {Number(capacityWeight) > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                    <HiOutlineArchive className="text-sm" />
                    {Number(capacityWeight).toLocaleString()}{' '}
                    {weightUom ?? 'wt'}
                </p>
            ) : null}
            {cap > 0 && pct >= 90 ? (
                <p className="mt-0.5 animate-mm-util-warning text-[10px] font-semibold text-amber-600 motion-reduce:animate-none dark:text-amber-400">
                    {Math.round(pct)}% utilized
                </p>
            ) : null}
        </div>
    )
}

export function WmBinOperationsCell({
    pickingAllowed,
    putawayAllowed,
}: {
    pickingAllowed: boolean
    putawayAllowed: boolean
}) {
    return (
        <div className="flex flex-wrap gap-1">
            <Tag
                className={
                    pickingAllowed
                        ? 'border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-800 transition-transform duration-200 group-hover/row:scale-[1.03] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                        : 'text-[10px] text-gray-400 transition-opacity duration-200'
                }
            >
                Pick {pickingAllowed ? 'on' : 'off'}
            </Tag>
            <Tag
                className={
                    putawayAllowed
                        ? 'border-sky-200 bg-sky-50 text-[10px] font-semibold text-sky-800 transition-transform duration-200 group-hover/row:scale-[1.03] dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200'
                        : 'text-[10px] text-gray-400 transition-opacity duration-200'
                }
            >
                Putaway {putawayAllowed ? 'on' : 'off'}
            </Tag>
        </div>
    )
}
