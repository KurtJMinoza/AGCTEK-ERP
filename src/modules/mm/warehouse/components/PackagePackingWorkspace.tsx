'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineCube,
    HiOutlineMinus,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTruck,
    HiOutlineUser,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { isRenderableImageSrc, isUnoptimizedImage } from '@/utils/productImage'
import { packingService } from '../services/packingService'
import type {
    PackageScanLogEntry,
    WmPackage,
    WmPackageItem,
} from '../types'

/** Scanner-first packing screen for one package. */
export type PackagePackingWorkspaceProps = {
    pkg: WmPackage
    onChanged: () => Promise<void> | void
    onListChanged?: () => Promise<void> | void
}

type ItemFilter = 'all' | 'remaining' | 'completed' | 'exceptions'

const num = (value: unknown) => Number(value) || 0

export function packingLineStatus(item: {
    expectedQty: unknown
    scannedQty: unknown
}): 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' {
    const expected = num(item.expectedQty)
    const scanned = num(item.scannedQty)
    if (scanned <= 0) return 'PENDING'
    return scanned >= expected ? 'COMPLETE' : 'IN_PROGRESS'
}

const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In progress',
    COMPLETE: 'Complete',
}

const STATUS_CLASS: Record<string, string> = {
    PENDING:
        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    IN_PROGRESS:
        'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    COMPLETE:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
}

const PACKAGE_STATUS_TONE: Record<
    string,
    'success' | 'default' | 'warning' | 'danger'
> = {
    OPEN: 'default',
    PACKING: 'warning',
    VERIFIED: 'success',
    SEALED: 'success',
    DISPATCHED: 'success',
    CANCELLED: 'danger',
}

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-PH', {
        hour: 'numeric',
        minute: '2-digit',
    })

function ProgressRing({
    percent,
    size = 64,
}: {
    percent: number
    size?: number
}) {
    const stroke = 5
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c
    const done = percent >= 100
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                className="-rotate-90"
                aria-hidden
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    className="stroke-gray-200 dark:stroke-gray-600"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    className={`transition-[stroke-dashoffset] duration-500 ${
                        done
                            ? 'stroke-emerald-500'
                            : 'stroke-primary'
                    }`}
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {percent}%
            </span>
        </div>
    )
}

function useOrderLineByMaterial(pkg: WmPackage) {
    return useMemo(() => {
        const map = new Map<
            string,
            {
                productName?: string | null
                productImage?: string | null
                sku?: string | null
                variantName?: string | null
            }
        >()
        const lines =
            pkg.salesOrder?.lines ?? pkg.pickingTask?.salesOrder?.lines ?? []
        for (const line of lines) {
            if (!line?.materialId) continue
            map.set(line.materialId, {
                productName: line.productNameSnapshot,
                productImage: line.productImageSnapshot,
                sku: line.productSkuSnapshot ?? line.sku,
                variantName: line.variantName,
            })
        }
        return map
    }, [pkg.salesOrder?.lines, pkg.pickingTask?.salesOrder?.lines])
}

type PackingItemCardProps = {
    item: WmPackageItem
    snapshot?: {
        productName?: string | null
        productImage?: string | null
        sku?: string | null
        variantName?: string | null
    }
    lastScan?: PackageScanLogEntry
    editable: boolean
    scanning: boolean
    adjustingId: string | null
    index: number
    onScan: () => void
    onAdjust: (
        action: 'add' | 'remove' | 'reset',
        quantity?: number,
    ) => void
    onAddQty: () => void
    onReset: () => void
}

function PackingItemCard({
    item,
    snapshot,
    lastScan,
    editable,
    scanning,
    adjustingId,
    index,
    onScan,
    onAdjust,
    onAddQty,
    onReset,
}: PackingItemCardProps) {
    const expected = num(item.expectedQty)
    const scanned = num(item.scannedQty)
    const status = packingLineStatus(item)
    const remaining = Math.max(0, expected - scanned)
    const pct = expected ? Math.round((scanned / expected) * 100) : 0
    const title =
        snapshot?.productName?.trim() ||
        item.material?.materialName ||
        item.materialId
    const image = snapshot?.productImage ?? ''
    const busy = adjustingId === item.id

    return (
        <article
            className={`animate-mm-row-in motion-reduce:animate-none overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-900/40 ${
                status === 'COMPLETE'
                    ? 'border-emerald-200/80 dark:border-emerald-500/35'
                    : 'border-gray-200 dark:border-gray-600'
            }`}
            style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
        >
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                    {isRenderableImageSrc(image) ? (
                        <Image
                            src={image}
                            alt={title}
                            fill
                            sizes="64px"
                            unoptimized={isUnoptimizedImage(image)}
                            className="object-cover"
                        />
                    ) : (
                        <HiOutlineCube className="m-auto h-full w-6 text-gray-400" />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h4
                                className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                                title={title}
                            >
                                {title}
                            </h4>
                            <p className="truncate font-mono text-xs text-gray-500">
                                {item.material?.materialCode ?? item.materialId}
                                {snapshot?.variantName
                                    ? ` · ${snapshot.variantName}`
                                    : ''}
                            </p>
                        </div>
                        <Tag className={STATUS_CLASS[status]}>
                            {STATUS_LABEL[status]}
                        </Tag>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs dark:bg-gray-800/80">
                            <span className="text-gray-400">Expected </span>
                            <span className="font-semibold tabular-nums">
                                {expected}
                            </span>
                        </span>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs dark:bg-emerald-500/10">
                            <span className="text-emerald-700/70 dark:text-emerald-300/80">
                                Scanned{' '}
                            </span>
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {scanned}
                            </span>
                        </span>
                        <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs dark:bg-amber-500/10">
                            <span className="text-amber-700/70 dark:text-amber-300/80">
                                Left{' '}
                            </span>
                            <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                {remaining}
                            </span>
                        </span>
                    </div>

                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                            className={`h-full origin-left rounded-full transition-all duration-500 ${
                                status === 'COMPLETE'
                                    ? 'bg-emerald-500'
                                    : 'bg-primary'
                            }`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                        {lastScan ? (
                            <span className="inline-flex items-center gap-1">
                                <HiOutlineClock className="text-xs" />
                                {lastScan.scannedByName} ·{' '}
                                {formatTime(lastScan.scannedAt)}
                            </span>
                        ) : (
                            <span>Not scanned yet</span>
                        )}
                        <span className="tabular-nums">
                            {scanned}/{expected}
                        </span>
                    </div>
                </div>

                {editable ? (
                    <div className="flex shrink-0 flex-row flex-wrap gap-1.5 sm:w-36 sm:flex-col sm:justify-center">
                        <Button
                            size="sm"
                            variant="solid"
                            block
                            icon={<HiOutlineSearch />}
                            loading={scanning}
                            disabled={!!adjustingId && !busy}
                            onClick={onScan}
                        >
                            Scan
                        </Button>
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                className="flex-1"
                                icon={<HiOutlinePlus />}
                                disabled={busy}
                                onClick={() => onAdjust('add', 1)}
                            >
                                +1
                            </Button>
                            <Button
                                size="sm"
                                className="flex-1"
                                icon={<HiOutlineMinus />}
                                disabled={busy || scanned <= 0}
                                onClick={() => onAdjust('remove', 1)}
                            >
                                −1
                            </Button>
                        </div>
                        <Button
                            size="sm"
                            variant="plain"
                            disabled={busy}
                            onClick={onAddQty}
                        >
                            Add qty…
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            disabled={busy || scanned <= 0}
                            onClick={onReset}
                        >
                            Reset
                        </Button>
                    </div>
                ) : null}
            </div>
        </article>
    )
}

const PackagePackingWorkspace = ({
    pkg,
    onChanged,
    onListChanged,
}: PackagePackingWorkspaceProps) => {
    const scanInputRef = useRef<HTMLInputElement>(null)
    const lineByMaterial = useOrderLineByMaterial(pkg)

    const [scanValue, setScanValue] = useState('')
    const [scanQty, setScanQty] = useState('1')
    const [scanning, setScanning] = useState(false)
    const [filter, setFilter] = useState<ItemFilter>('all')
    const [adjustingId, setAdjustingId] = useState<string | null>(null)
    const [addQtyItem, setAddQtyItem] = useState<WmPackageItem | null>(null)
    const [addQtyValue, setAddQtyValue] = useState('1')
    const [addQtyReason, setAddQtyReason] = useState('')
    const [resetItem, setResetItem] = useState<WmPackageItem | null>(null)
    const [partialOpen, setPartialOpen] = useState(false)
    const [partialReason, setPartialReason] = useState('')
    const [completing, setCompleting] = useState(false)

    const items = useMemo(() => pkg.items ?? [], [pkg.items])
    const editable = pkg.status === 'OPEN' || pkg.status === 'PACKING'

    const totals = useMemo(() => {
        const totalExpected = items.reduce(
            (sum, i) => sum + num(i.expectedQty),
            0,
        )
        const totalScanned = items.reduce(
            (sum, i) => sum + num(i.scannedQty),
            0,
        )
        return {
            totalExpected,
            totalScanned,
            remaining: Math.max(0, totalExpected - totalScanned),
            percent: totalExpected
                ? Math.round((totalScanned / totalExpected) * 100)
                : 0,
            lineCount: items.length,
            linesComplete: items.filter(
                (i) => packingLineStatus(i) === 'COMPLETE',
            ).length,
        }
    }, [items])

    const focusScan = useCallback(() => {
        scanInputRef.current?.focus()
        scanInputRef.current?.select()
    }, [])

    useEffect(() => {
        focusScan()
    }, [focusScan, pkg.id])

    const applyResult = useCallback(
        async (result: { line?: { materialCode?: string | null } | null }) => {
            await onChanged()
            await onListChanged?.()
            return result
        },
        [onChanged, onListChanged],
    )

    const handleScan = useCallback(async () => {
        const code = scanValue.trim()
        if (!code || scanning) return
        setScanning(true)
        try {
            const result = await packingService.scanItem(pkg.id, {
                barcode: code,
                quantity: Number(scanQty) > 0 ? Number(scanQty) : 1,
                scanType: 'barcode',
            })
            await applyResult(result)
            notify(
                'success',
                'Scanned',
                `${result.line?.materialCode ?? code} — ${result.totalScanned} of ${result.totalExpected} scanned.`,
            )
            setScanValue('')
        } catch (err) {
            notify(
                'danger',
                'Scan failed',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setScanning(false)
            focusScan()
        }
    }, [scanValue, scanQty, scanning, pkg.id, applyResult, focusScan])

    const scanThisItem = useCallback(
        async (item: WmPackageItem) => {
            if (scanning || !editable) return
            setScanning(true)
            try {
                const result = await packingService.scanItem(pkg.id, {
                    materialCode: item.material?.materialCode,
                    scanType: 'manual',
                })
                await applyResult(result)
                notify(
                    'success',
                    'Scanned',
                    `${result.line?.materialCode ?? item.materialId} — ${result.line?.scannedQuantity}/${result.line?.expectedQuantity}`,
                )
            } catch (err) {
                notify(
                    'danger',
                    'Scan failed',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setScanning(false)
                focusScan()
            }
        },
        [scanning, editable, pkg.id, applyResult, focusScan],
    )

    const adjust = useCallback(
        async (
            item: WmPackageItem,
            action: 'add' | 'remove' | 'reset',
            quantity?: number,
            reason?: string,
        ) => {
            if (adjustingId) return
            setAdjustingId(item.id)
            try {
                const result = await packingService.adjustItem(
                    pkg.id,
                    item.id,
                    {
                        action,
                        quantity,
                        reason,
                    },
                )
                await applyResult(result)
            } catch (err) {
                notify(
                    'danger',
                    'Adjustment failed',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setAdjustingId(null)
                focusScan()
            }
        },
        [adjustingId, pkg.id, applyResult, focusScan],
    )

    const completePacking = useCallback(
        async (allowPartial: boolean, reason?: string) => {
            setCompleting(true)
            try {
                const result = await packingService.completePacking(pkg.id, {
                    allowPartial,
                    reason,
                })
                await applyResult(result)
                notify(
                    'success',
                    allowPartial ? 'Packed with exceptions' : 'Packing complete',
                    allowPartial
                        ? 'Short pack recorded — disposition before dispatch.'
                        : `${pkg.packageNumber} is verified and ready to seal.`,
                )
                setPartialOpen(false)
            } catch (err) {
                notify(
                    'danger',
                    'Packing not complete',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setCompleting(false)
                focusScan()
            }
        },
        [pkg.id, pkg.packageNumber, applyResult, focusScan],
    )

    const lastScannedByItem = useMemo(() => {
        const map = new Map<string, PackageScanLogEntry>()
        for (const log of pkg.scanLogs ?? []) {
            if (!log.packageItemId || !log.scannedByName) continue
            if (!map.has(log.packageItemId)) map.set(log.packageItemId, log)
        }
        return map
    }, [pkg.scanLogs])

    const recentLogs = useMemo(
        () => (pkg.scanLogs ?? []).slice(0, 8),
        [pkg.scanLogs],
    )

    const filteredItems = useMemo(() => {
        switch (filter) {
            case 'remaining':
                return items.filter(
                    (i) => packingLineStatus(i) !== 'COMPLETE',
                )
            case 'completed':
                return items.filter(
                    (i) => packingLineStatus(i) === 'COMPLETE',
                )
            case 'exceptions':
                return items.filter(
                    (i) =>
                        num(i.scannedQty) > num(i.expectedQty) ||
                        (num(i.scannedQty) > 0 &&
                            num(i.scannedQty) < num(i.expectedQty)),
                )
            default:
                return items
        }
    }, [items, filter])

    const orderNumber =
        pkg.salesOrder?.orderNumber ??
        pkg.pickingTask?.salesOrder?.orderNumber ??
        pkg.orderNumber
    const customerName =
        pkg.salesOrder?.customerName ??
        pkg.pickingTask?.salesOrder?.customerName ??
        pkg.shipToName

    const remainingCount = items.filter(
        (i) => packingLineStatus(i) !== 'COMPLETE',
    ).length

    return (
        <div className="space-y-4">
            {/* Hero summary */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 via-white to-primary-subtle/30 dark:border-gray-600 dark:from-gray-800/80 dark:via-gray-900/40 dark:to-primary/5">
                <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                    <ProgressRing percent={totals.percent} size={72} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                                tone={
                                    PACKAGE_STATUS_TONE[pkg.status] ?? 'default'
                                }
                            >
                                {pkg.status.replace(/_/g, ' ')}
                            </StatusBadge>
                            <span className="font-mono text-base font-bold text-gray-900 dark:text-gray-100">
                                {pkg.packageNumber}
                            </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                            {orderNumber ? (
                                <span className="font-mono text-xs font-semibold text-sky-800 dark:text-sky-300">
                                    {orderNumber}
                                </span>
                            ) : (
                                <span className="text-xs text-gray-400">
                                    Manual package
                                </span>
                            )}
                            {customerName ? (
                                <span className="inline-flex items-center gap-1 text-xs">
                                    <HiOutlineUser className="text-sm opacity-60" />
                                    {customerName}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            {totals.linesComplete} of {totals.lineCount} line(s)
                            complete ·{' '}
                            <span className="font-medium tabular-nums text-gray-700 dark:text-gray-200">
                                {totals.totalScanned}/{totals.totalExpected}
                            </span>{' '}
                            units scanned
                        </p>
                    </div>
                    {totals.remaining === 0 && editable ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                            <HiOutlineCheckCircle className="text-base" />
                            Ready to complete
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-start">
                {/* Left: scan + finish + activity */}
                <aside className="space-y-4 lg:sticky lg:top-2">
                    {editable ? (
                        <div className="rounded-xl border-2 border-primary/25 bg-primary-subtle/40 p-4 shadow-sm dark:border-primary/30 dark:bg-primary/10">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-deep dark:text-primary-light">
                                Scanner
                            </p>
                            <Input
                                ref={scanInputRef}
                                size="lg"
                                autoFocus
                                placeholder="Barcode or material code"
                                value={scanValue}
                                onChange={(e) => setScanValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        void handleScan()
                                    }
                                }}
                                prefix={
                                    <HiOutlineSearch className="text-lg text-primary" />
                                }
                            />
                            <div className="mt-2 flex gap-2">
                                <Input
                                    size="sm"
                                    className="w-20"
                                    value={scanQty}
                                    onChange={(e) => setScanQty(e.target.value)}
                                    aria-label="Quantity per scan"
                                    type="number"
                                    min={1}
                                />
                                <Button
                                    className="flex-1"
                                    size="sm"
                                    variant="solid"
                                    loading={scanning}
                                    disabled={!scanValue.trim()}
                                    onClick={() => void handleScan()}
                                >
                                    Scan item
                                </Button>
                            </div>
                            <p className="mt-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                                Focus stays here for wedge scanners. Press{' '}
                                <kbd className="rounded border border-gray-200 bg-white px-1 dark:border-gray-600 dark:bg-gray-800">
                                    Enter
                                </kbd>{' '}
                                to add quantity to the matching line.
                            </p>
                        </div>
                    ) : null}

                    {editable ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-900/30">
                            <p className="text-sm font-semibold heading-text">
                                Finish packing
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {totals.remaining === 0
                                    ? 'All lines are fully scanned.'
                                    : `${totals.remaining} unit(s) still open.`}
                            </p>
                            <Button
                                className="mt-3 w-full"
                                variant="solid"
                                icon={<HiOutlineTruck />}
                                loading={completing}
                                disabled={totals.remaining > 0}
                                onClick={() => void completePacking(false)}
                            >
                                Complete packing
                            </Button>
                            {totals.remaining > 0 ? (
                                <Button
                                    className="mt-2 w-full"
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setPartialOpen(true)}
                                >
                                    Short pack with reason…
                                </Button>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-900/30">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Recent activity
                        </p>
                        <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                            {recentLogs.map((log) => (
                                <li
                                    key={log.id}
                                    className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-b border-gray-100 pb-2 last:border-0 dark:border-gray-700"
                                >
                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                        {log.material?.materialCode ??
                                            log.materialId}
                                    </span>
                                    <span
                                        className={
                                            log.action === 'remove'
                                                ? 'font-semibold text-rose-500'
                                                : 'font-semibold text-emerald-600 dark:text-emerald-400'
                                        }
                                    >
                                        {log.action === 'reset'
                                            ? 'reset'
                                            : `${log.action === 'remove' ? '−' : '+'}${num(log.scannedQuantity)}`}
                                    </span>
                                    <span className="text-gray-400">
                                        {log.scannedByName ?? 'system'} ·{' '}
                                        {formatTime(log.scannedAt)}
                                    </span>
                                </li>
                            ))}
                            {recentLogs.length === 0 ? (
                                <li className="py-4 text-center text-gray-400">
                                    No scans yet
                                </li>
                            ) : null}
                        </ul>
                    </div>
                </aside>

                {/* Right: item list */}
                <section className="min-w-0 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Segment
                            className="w-full sm:w-auto"
                            value={filter}
                            onChange={(v) => setFilter(v as ItemFilter)}
                        >
                            <Segment.Item value="all">All</Segment.Item>
                            <Segment.Item value="remaining">
                                Remaining
                                {remainingCount > 0 ? ` (${remainingCount})` : ''}
                            </Segment.Item>
                            <Segment.Item value="completed">Done</Segment.Item>
                            <Segment.Item value="exceptions">
                                Exceptions
                            </Segment.Item>
                        </Segment>
                        <span className="text-xs text-gray-500">
                            Showing {filteredItems.length} of {items.length}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {filteredItems.map((item, index) => (
                            <PackingItemCard
                                key={item.id}
                                item={item}
                                index={index}
                                snapshot={lineByMaterial.get(item.materialId)}
                                lastScan={lastScannedByItem.get(item.id)}
                                editable={editable}
                                scanning={scanning}
                                adjustingId={adjustingId}
                                onScan={() => void scanThisItem(item)}
                                onAdjust={(action, qty) =>
                                    void adjust(item, action, qty)
                                }
                                onAddQty={() => {
                                    setAddQtyItem(item)
                                    setAddQtyValue('1')
                                    setAddQtyReason('')
                                }}
                                onReset={() => setResetItem(item)}
                            />
                        ))}
                        {filteredItems.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-600">
                                <HiOutlineCube className="mx-auto mb-2 text-3xl text-gray-300" />
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                    No items in this view
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                    Try another filter or scan a barcode.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            <Dialog
                isOpen={addQtyItem !== null}
                onClose={() => setAddQtyItem(null)}
            >
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">
                        Add quantity —{' '}
                        {addQtyItem?.material?.materialCode ??
                            addQtyItem?.materialId}
                    </h5>
                    <p className="mb-4 text-sm text-gray-500">
                        Expected {num(addQtyItem?.expectedQty)}, scanned{' '}
                        {num(addQtyItem?.scannedQty)}.
                    </p>
                    <FormItem label="Quantity to add">
                        <Input
                            type="number"
                            min={1}
                            value={addQtyValue}
                            onChange={(e) => setAddQtyValue(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Reason (optional)">
                        <Input
                            placeholder="e.g. scanner unavailable"
                            value={addQtyReason}
                            onChange={(e) => setAddQtyReason(e.target.value)}
                        />
                    </FormItem>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={() => setAddQtyItem(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            loading={!!adjustingId}
                            onClick={() => {
                                if (!addQtyItem) return
                                const qty = Number(addQtyValue)
                                if (!Number.isFinite(qty) || qty <= 0) {
                                    notify(
                                        'danger',
                                        'Invalid quantity',
                                        'Enter at least 1.',
                                    )
                                    return
                                }
                                void adjust(
                                    addQtyItem,
                                    'add',
                                    qty,
                                    addQtyReason.trim() || undefined,
                                )
                                setAddQtyItem(null)
                            }}
                        >
                            Confirm
                        </Button>
                    </div>
                </div>
            </Dialog>

            <Dialog isOpen={resetItem !== null} onClose={() => setResetItem(null)}>
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">Reset line?</h5>
                    <p className="text-sm text-gray-500">
                        Sets scanned qty for{' '}
                        <span className="font-semibold">
                            {resetItem?.material?.materialCode ??
                                resetItem?.materialId}
                        </span>{' '}
                        to zero (logged in audit).
                    </p>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="plain" onClick={() => setResetItem(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            customColorClass={() =>
                                'bg-red-500 hover:bg-red-600 text-white'
                            }
                            loading={!!adjustingId}
                            onClick={() => {
                                if (resetItem) void adjust(resetItem, 'reset')
                                setResetItem(null)
                            }}
                        >
                            Reset
                        </Button>
                    </div>
                </div>
            </Dialog>

            <Dialog isOpen={partialOpen} onClose={() => setPartialOpen(false)}>
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">Short pack?</h5>
                    <p className="text-sm text-gray-500">
                        {totals.remaining} unit(s) will stay unpacked. Reason is
                        required for disposition.
                    </p>
                    <FormItem label="Reason (required)">
                        <Input
                            placeholder="e.g. damaged in pick"
                            value={partialReason}
                            onChange={(e) => setPartialReason(e.target.value)}
                        />
                    </FormItem>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={() => setPartialOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            customColorClass={() =>
                                'bg-amber-500 hover:bg-amber-600 text-white'
                            }
                            loading={completing}
                            disabled={!partialReason.trim()}
                            onClick={() =>
                                void completePacking(true, partialReason.trim())
                            }
                        >
                            Complete with exceptions
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    )
}

export default PackagePackingWorkspace
