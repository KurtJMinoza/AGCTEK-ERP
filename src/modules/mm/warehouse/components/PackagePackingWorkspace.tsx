'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
    HiOutlineCube,
    HiOutlineMinus,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTruck,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Progress from '@/components/ui/Progress'
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
    /** Re-fetch the package after any scan / adjustment / completion. */
    onChanged: () => Promise<void> | void
    /** Refresh the packages list behind the dialog. */
    onListChanged?: () => Promise<void> | void
}

type ItemFilter = 'all' | 'remaining' | 'completed' | 'exceptions'

const num = (value: unknown) => Number(value) || 0

/** PENDING (0) · IN_PROGRESS (partial) · COMPLETE (expected). */
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
    IN_PROGRESS: 'In Progress',
    COMPLETE: 'Complete',
}

const STATUS_CLASS: Record<string, string> = {
    PENDING:
        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    IN_PROGRESS:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    COMPLETE:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
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

const FILTERS: Array<{ value: ItemFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'remaining', label: 'Remaining' },
    { value: 'completed', label: 'Completed' },
    { value: 'exceptions', label: 'Exceptions' },
]

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

/** Product snapshot (kept even for archived/deleted products) by material. */
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
    const editable =
        pkg.status === 'OPEN' || pkg.status === 'PACKING'

    const totals = useMemo(() => {
        const totalExpected = items.reduce((sum, i) => sum + num(i.expectedQty), 0)
        const totalScanned = items.reduce((sum, i) => sum + num(i.scannedQty), 0)
        return {
            totalExpected,
            totalScanned,
            remaining: Math.max(0, totalExpected - totalScanned),
            percent: totalExpected
                ? Math.round((totalScanned / totalExpected) * 100)
                : 0,
        }
    }, [items])

    /** Keep focus in the scan field so a scanner can fire continuously. */
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
                const result = await packingService.adjustItem(pkg.id, item.id, {
                    action,
                    quantity,
                    reason,
                })
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
                        ? 'Short pack recorded — disposition it before dispatch.'
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

    /** Last scanner per item from the audit trail (multiple users may scan). */
    const lastScannedByItem = useMemo(() => {
        const map = new Map<string, PackageScanLogEntry>()
        for (const log of pkg.scanLogs ?? []) {
            if (!log.packageItemId || !log.scannedByName) continue
            if (!map.has(log.packageItemId)) map.set(log.packageItemId, log)
        }
        return map
    }, [pkg.scanLogs])

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

    return (
        <div className="space-y-5">
            {/* ── Header: package, order, customer, progress ── */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-700/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <StatusBadge tone={PACKAGE_STATUS_TONE[pkg.status] ?? 'default'}>
                            {pkg.status.replace(/_/g, ' ')}
                        </StatusBadge>
                        <span className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {pkg.packageNumber}
                            </span>
                            {orderNumber ? (
                                <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                    Order {orderNumber}
                                </Tag>
                            ) : (
                                <Tag className="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                    Manual package
                                </Tag>
                            )}
                        </span>
                        {customerName ? (
                            <span className="text-xs text-gray-500">
                                {customerName}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {totals.totalScanned} of {totals.totalExpected} scanned
                        </span>
                        <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                                totals.remaining === 0
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                            }`}
                        >
                            {totals.percent}%
                        </span>
                    </div>
                </div>
                <Progress
                    percent={totals.percent}
                    className="mt-3"
                    customColorClass={
                        totals.remaining === 0 ? 'bg-emerald-500' : 'bg-amber-500'
                    }
                />
                <p className="mt-1.5 text-xs text-gray-500">
                    {totals.remaining === 0
                        ? 'All items fully scanned — you can complete packing.'
                        : `${totals.remaining} item(s) remaining`}
                </p>
            </div>

            {/* ── Main scan bar ── */}
            {editable ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[260px] flex-1">
                            <FormItem label="Scan item">
                                <Input
                                    ref={scanInputRef}
                                    size="lg"
                                    autoFocus
                                    placeholder="Scan barcode or enter material code"
                                    value={scanValue}
                                    onChange={(e) => setScanValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            void handleScan()
                                        }
                                    }}
                                    prefix={
                                        <HiOutlineSearch className="text-lg text-gray-400" />
                                    }
                                />
                            </FormItem>
                        </div>
                        <Input
                            size="lg"
                            className="w-20"
                            value={scanQty}
                            onChange={(e) => setScanQty(e.target.value)}
                            aria-label="Quantity per scan"
                            type="number"
                            min={1}
                        />
                        <Button
                            size="lg"
                            variant="solid"
                            icon={<HiOutlineSearch />}
                            loading={scanning}
                            disabled={!scanValue.trim()}
                            onClick={() => void handleScan()}
                        >
                            Scan
                        </Button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                        Scan the item&apos;s barcode or type its material code, then
                        press <span className="font-medium">Enter</span>. The scan
                        quantity adds to the line&apos;s scanned total.
                    </p>
                </div>
            ) : null}

            {/* ── Filters ── */}
            <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((f) => (
                    <Button
                        key={f.value}
                        size="xs"
                        variant={filter === f.value ? 'solid' : 'plain'}
                        onClick={() => setFilter(f.value)}
                    >
                        {f.label}
                        {f.value === 'remaining' && totals.remaining > 0
                            ? ` (${items.filter((i) => packingLineStatus(i) !== 'COMPLETE').length})`
                            : ''}
                    </Button>
                ))}
                <span className="ml-auto text-xs text-gray-400">
                    {filteredItems.length} of {items.length} item(s)
                </span>
            </div>

            {/* ── Item cards ── */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {filteredItems.map((item) => {
                    const expected = num(item.expectedQty)
                    const scanned = num(item.scannedQty)
                    const status = packingLineStatus(item)
                    const remaining = Math.max(0, expected - scanned)
                    const snapshot = lineByMaterial.get(item.materialId)
                    const title =
                        snapshot?.productName?.trim() ||
                        item.material?.materialName ||
                        item.materialId
                    const image = snapshot?.productImage ?? ''
                    const lastScan = lastScannedByItem.get(item.id)
                    return (
                        <div
                            key={item.id}
                            className={`rounded-lg border p-3.5 ${
                                status === 'COMPLETE'
                                    ? 'border-emerald-200 dark:border-emerald-500/40'
                                    : 'border-gray-200 dark:border-gray-600'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                                    {isRenderableImageSrc(image) ? (
                                        <Image
                                            src={image}
                                            alt={title}
                                            fill
                                            sizes="48px"
                                            unoptimized={isUnoptimizedImage(image)}
                                            className="object-cover"
                                        />
                                    ) : (
                                        <HiOutlineCube className="m-auto h-full w-5 text-gray-400" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p
                                        className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
                                        title={title}
                                    >
                                        {title}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                        {item.material?.materialCode ??
                                            item.materialId}
                                        {snapshot?.variantName
                                            ? ` · ${snapshot.variantName}`
                                            : ''}
                                    </p>
                                </div>
                                <Tag className={STATUS_CLASS[status]}>
                                    {STATUS_LABEL[status]}
                                </Tag>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                <div className="rounded-md bg-gray-50 py-1.5 dark:bg-gray-700/50">
                                    <p className="text-gray-400">Expected</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                        {expected}
                                    </p>
                                </div>
                                <div className="rounded-md bg-gray-50 py-1.5 dark:bg-gray-700/50">
                                    <p className="text-gray-400">Scanned</p>
                                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                        {scanned}
                                    </p>
                                </div>
                                <div className="rounded-md bg-gray-50 py-1.5 dark:bg-gray-700/50">
                                    <p className="text-gray-400">Remaining</p>
                                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                        {remaining}
                                    </p>
                                </div>
                            </div>

                            <Progress
                                percent={
                                    expected
                                        ? Math.round((scanned / expected) * 100)
                                        : 0
                                }
                                className="mt-2.5"
                                showInfo={false}
                                customColorClass={
                                    status === 'COMPLETE'
                                        ? 'bg-emerald-500'
                                        : 'bg-amber-500'
                                }
                            />

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {lastScan ? (
                                    <span className="mr-auto text-[11px] text-gray-400">
                                        Last scanned by{' '}
                                        <span className="font-medium text-gray-500">
                                            {lastScan.scannedByName}
                                        </span>{' '}
                                        at {formatTime(lastScan.scannedAt)}
                                    </span>
                                ) : (
                                    <span className="mr-auto rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                        Not scanned yet
                                    </span>
                                )}
                                {editable ? (
                                    <>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            icon={<HiOutlinePlus />}
                                            disabled={!!adjustingId}
                                            onClick={() =>
                                                void adjust(item, 'add', 1)
                                            }
                                        >
                                            +1
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            icon={<HiOutlineMinus />}
                                            disabled={
                                                !!adjustingId || scanned <= 0
                                            }
                                            onClick={() =>
                                                void adjust(item, 'remove', 1)
                                            }
                                        >
                                            −1
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            disabled={!!adjustingId}
                                            onClick={() => {
                                                setAddQtyItem(item)
                                                setAddQtyValue('1')
                                                setAddQtyReason('')
                                            }}
                                        >
                                            Add quantity
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            icon={<HiOutlineRefresh />}
                                            disabled={
                                                !!adjustingId || scanned <= 0
                                            }
                                            onClick={() => setResetItem(item)}
                                        >
                                            Reset
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            icon={<HiOutlineSearch />}
                                            loading={scanning}
                                            disabled={!!adjustingId}
                                            onClick={() =>
                                                void scanThisItem(item)
                                            }
                                        >
                                            Scan this item
                                        </Button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )
                })}
                {filteredItems.length === 0 ? (
                    <p className="col-span-full rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-gray-600">
                        No items match this filter.
                    </p>
                ) : null}
            </div>

            {/* ── Recently scanned ── */}
            <div>
                <p className="mb-2 text-sm font-semibold heading-text">
                    Recently scanned
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-600">
                    {(pkg.scanLogs ?? []).map((log) => (
                        <li
                            key={log.id}
                            className="flex flex-wrap items-center gap-1.5"
                        >
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                                {log.material?.materialName ??
                                    log.material?.materialCode ??
                                    log.materialId}
                            </span>
                            <span
                                className={
                                    log.action === 'remove'
                                        ? 'text-rose-500'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                }
                            >
                                {log.action === 'reset'
                                    ? 'reset'
                                    : `${log.action === 'remove' ? '−' : '+'}${num(log.scannedQuantity)}`}
                            </span>
                            <span className="text-gray-400">
                                by {log.scannedByName ?? 'system'}
                            </span>
                            <span className="text-gray-400">
                                at {formatTime(log.scannedAt)}
                            </span>
                            <Tag className="ml-auto bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                {log.scanType}
                            </Tag>
                        </li>
                    ))}
                    {(pkg.scanLogs ?? []).length === 0 ? (
                        <li className="text-gray-400">No scans yet.</li>
                    ) : null}
                </ul>
            </div>

            {/* ── Complete Packing ── */}
            {editable ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/40">
                    <Button
                        variant="solid"
                        icon={<HiOutlineTruck />}
                        loading={completing}
                        disabled={totals.remaining > 0}
                        onClick={() => void completePacking(false)}
                    >
                        Complete Packing
                    </Button>
                    {totals.remaining > 0 ? (
                        <>
                            <span className="text-sm text-gray-500">
                                {totals.remaining} item(s) remaining
                            </span>
                            <Button
                                size="sm"
                                variant="plain"
                                className="ml-auto"
                                onClick={() => setPartialOpen(true)}
                            >
                                Complete with short pack…
                            </Button>
                        </>
                    ) : null}
                </div>
            ) : null}

            {/* ── Add quantity dialog (manual confirmation) ── */}
            <Dialog
                isOpen={addQtyItem !== null}
                onClose={() => setAddQtyItem(null)}
            >
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">
                        Add quantity —{' '}
                        {addQtyItem?.material?.materialCode ?? addQtyItem?.materialId}
                    </h5>
                    <p className="mb-4 text-sm text-gray-500">
                        Manual quantity entry requires confirmation. Expected:{' '}
                        {num(addQtyItem?.expectedQty)}, already scanned:{' '}
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
                        <Button variant="plain" onClick={() => setAddQtyItem(null)}>
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
                                        'Enter a quantity of at least 1.',
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
                            Confirm add
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* ── Reset confirmation ── */}
            <Dialog isOpen={resetItem !== null} onClose={() => setResetItem(null)}>
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">Reset item scan?</h5>
                    <p className="text-sm text-gray-500">
                        This sets scanned quantity of{' '}
                        <span className="font-semibold">
                            {resetItem?.material?.materialCode ??
                                resetItem?.materialId}
                        </span>{' '}
                        back to 0. The adjustment is recorded in the scan audit
                        log.
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

            {/* ── Short-pack (explicit partial) confirmation ── */}
            <Dialog isOpen={partialOpen} onClose={() => setPartialOpen(false)}>
                <div className="p-5">
                    <h5 className="mb-2 text-base font-bold">
                        Complete with short pack?
                    </h5>
                    <p className="text-sm text-gray-500">
                        {totals.remaining} unit(s) will remain unpacked. A
                        reason is required and the shortfall stays visible on
                        the package for disposition before dispatch.
                    </p>
                    <FormItem label="Reason (required)">
                        <Input
                            placeholder="e.g. 2 units damaged in transit"
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
