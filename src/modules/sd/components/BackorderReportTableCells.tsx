'use client'

import {
    HiOutlineBell,
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineCube,
    HiOutlineTruck,
    HiOutlineUser,
} from 'react-icons/hi'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import {
    wmIconPopClass,
    wmTableRowEnterClass,
} from '@/modules/mm/warehouse/components/WarehouseTableCells'
import { productDivisionLabel } from '../catalogs/productDivisions'
import type { Backorder, BackorderReason } from '../services/backorderService'

export const boTableRowEnterClass = wmTableRowEnterClass

export const BO_REASON_META: Record<
    BackorderReason,
    { label: string; tone: StatusTone }
> = {
    STOCK_SHORTAGE: { label: 'Stock shortage', tone: 'danger' },
    AWAITING_RESERVATION: { label: 'Awaiting reservation', tone: 'warning' },
    NO_MATERIAL: { label: 'No MM material', tone: 'default' },
}

export const formatBackorderDate = (value: string | null) =>
    value
        ? new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium' })
        : null

export const formatBackorderQty = (qty: number, uom: string | null) =>
    `${qty.toLocaleString('en-PH', { maximumFractionDigits: 3 })}${uom ? ` ${uom}` : ''}`

type BoOrderCellProps = {
    row: Backorder
    showCustomerOnNarrow?: boolean
}

export function BoOrderCell({
    row,
    showCustomerOnNarrow = true,
}: BoOrderCellProps) {
    return (
        <div className="flex min-w-0 items-start gap-2.5 py-0.5">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep dark:bg-primary/15 dark:text-primary-light ${wmIconPopClass(70)}`}
            >
                <HiOutlineClipboardList className="text-lg" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-semibold text-primary">
                        {row.orderNumber}
                    </span>
                    {row.critical ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-500/20 dark:text-red-300">
                            {row.ageDays}d critical
                        </span>
                    ) : row.ageDays > 3 ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                            {row.ageDays}d open
                        </span>
                    ) : null}
                </div>
                {showCustomerOnNarrow && row.customerName ? (
                    <p className="mt-0.5 truncate text-[11px] text-gray-500 sm:hidden">
                        {row.customerName}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function BoCustomerCell({ row }: { row: Backorder }) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 sm:flex ${wmIconPopClass(90)}`}
            >
                <HiOutlineUser className="text-base" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {row.customerName ?? '—'}
                </p>
                {row.customerCode ? (
                    <p className="truncate font-mono text-[11px] text-gray-500">
                        {row.customerCode}
                    </p>
                ) : null}
            </div>
        </div>
    )
}

type BoProductCellProps = {
    row: Backorder
    showQtyOnNarrow?: boolean
}

export function BoProductCell({
    row,
    showQtyOnNarrow = true,
}: BoProductCellProps) {
    return (
        <div className="flex min-w-0 items-start gap-2 py-0.5">
            <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 ${wmIconPopClass(85)}`}
            >
                <HiOutlineCube className="text-base" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] font-medium text-gray-500">
                    {row.sku ?? '—'}
                </p>
                <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {row.productName}
                </p>
                {row.divisionId ? (
                    <p className="truncate text-[11px] text-gray-400">
                        {productDivisionLabel(row.divisionId)}
                    </p>
                ) : null}
                {showQtyOnNarrow ? (
                    <p className="mt-1 text-[11px] text-gray-500 md:hidden">
                        Ord {formatBackorderQty(row.orderedQty, row.uom)} · Open{' '}
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {formatBackorderQty(row.openQty, row.uom)}
                        </span>
                    </p>
                ) : null}
            </div>
        </div>
    )
}

export function BoOrderedQtyCell({ row }: { row: Backorder }) {
    return (
        <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
            {formatBackorderQty(row.orderedQty, row.uom)}
        </span>
    )
}

export function BoOpenQtyCell({ row }: { row: Backorder }) {
    const meta = BO_REASON_META[row.reason]
    return (
        <div className="flex min-w-[6.5rem] flex-col items-start gap-1.5">
            <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {formatBackorderQty(row.openQty, row.uom)}
            </span>
            <StatusBadge tone={meta.tone} className="max-w-full truncate">
                {meta.label}
            </StatusBadge>
        </div>
    )
}

export function BoOrderDateCell({ row }: { row: Backorder }) {
    const label = formatBackorderDate(row.orderDate)
    return (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
            <HiOutlineCalendar className="shrink-0 text-base text-gray-400" />
            {label ?? '—'}
        </div>
    )
}

export function BoEtaCell({ row }: { row: Backorder }) {
    if (row.expectedRestockDate) {
        return (
            <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                <HiOutlineTruck className="shrink-0 text-base text-emerald-500" />
                {formatBackorderDate(row.expectedRestockDate)}
            </div>
        )
    }
    return (
        <div className="flex items-start gap-1.5 text-xs text-gray-400">
            <HiOutlineClock className="mt-0.5 shrink-0 text-base" />
            <span>
                {row.reason === 'NO_MATERIAL'
                    ? 'Link an MM material'
                    : 'No incoming PO'}
            </span>
        </div>
    )
}

type BoNotifyActionCellProps = {
    row: Backorder
    notified: boolean
    onNotify: () => void
}

export function BoNotifyActionCell({
    row,
    notified,
    onNotify,
}: BoNotifyActionCellProps) {
    if (notified) {
        return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Notified
            </span>
        )
    }
    return (
        <Button
            size="xs"
            variant="plain"
            icon={<HiOutlineBell />}
            className="whitespace-nowrap"
            onClick={onNotify}
        >
            <span className="hidden sm:inline">Notify Customer</span>
            <span className="sm:hidden">Notify</span>
        </Button>
    )
}
