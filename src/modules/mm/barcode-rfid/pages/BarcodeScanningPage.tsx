'use client'

import { useCallback, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import MobileScanShell from '../components/MobileScanShell'
import {
    scannerService,
    newIdempotencyKey,
    getScannerUserId,
    getDeviceId,
} from '../services/scannerService'
import type { ResolveHit, ScannerOperation } from '../types'

const ROUTE = '/modules/mm/barcode-rfid/barcode-scanning'

const OPS: { value: ScannerOperation; label: string }[] = [
    { value: 'RECEIVING', label: 'Receiving' },
    { value: 'PUTAWAY', label: 'Putaway' },
    { value: 'PICKING', label: 'Picking' },
    { value: 'PACKING', label: 'Packing' },
    { value: 'COUNTING', label: 'Counting' },
    { value: 'TRANSFER', label: 'Transfer (bin)' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const BarcodeScanningPage = () => {
    const [barcode, setBarcode] = useState('')
    const [hit, setHit] = useState<ResolveHit | null>(null)
    const [operation, setOperation] = useState<ScannerOperation>('RECEIVING')
    const [quantity, setQuantity] = useState('1')
    const [ctx, setCtx] = useState({
        expectedReceiptId: '',
        expectedReceiptLineId: '',
        putawayTaskId: '',
        pickingTaskId: '',
        packageId: '',
        countLineId: '',
        warehouseId: '',
        bin: '',
        destinationBin: '',
        batch: '',
        serial: '',
    })
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
    } | null>(null)

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        setFeedback(null)
        try {
            const r = await scannerService.resolve(barcode.trim())
            setHit(r)
            setFeedback({
                type: 'success',
                message: `Resolved as ${r.type}${r.material ? `: ${r.material.materialCode}` : ''}${r.storageBin ? `: bin ${r.storageBin.code}` : ''}${r.batch ? `: batch ${r.batch.batchNumber}` : ''}${r.serial ? `: serial ${r.serial.serialNumber}` : ''}`,
            })
            if (r.type === 'STORAGE_BIN' && r.storageBinId) {
                setCtx((p) => ({ ...p, bin: r.storageBinId! }))
            }
            if (r.batchId) setCtx((p) => ({ ...p, batch: r.batchId! }))
            if (r.serialNumberId) setCtx((p) => ({ ...p, serial: r.serialNumberId! }))
            if (r.warehouseId) setCtx((p) => ({ ...p, warehouseId: r.warehouseId! }))
        } catch (err: any) {
            setHit(null)
            const msg = err?.response?.data?.message || 'Barcode not found'
            setFeedback({ type: 'danger', message: Array.isArray(msg) ? msg.join(', ') : msg })
            pushToast('danger', 'Lookup failed', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setScanning(false)
        }
    }, [barcode])

    const onConfirm = useCallback(async () => {
        setConfirming(true)
        setFeedback(null)
        try {
            const res = await scannerService.postEvent({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation,
                barcode: barcode.trim(),
                timestamp: new Date().toISOString(),
                quantity: Number(quantity) || undefined,
                warehouseId: ctx.warehouseId || undefined,
                bin: ctx.bin || undefined,
                batch: ctx.batch || undefined,
                serial: ctx.serial || undefined,
                idempotencyKey: newIdempotencyKey(operation.toLowerCase()),
                expectedReceiptId: ctx.expectedReceiptId || undefined,
                expectedReceiptLineId: ctx.expectedReceiptLineId || undefined,
                putawayTaskId: ctx.putawayTaskId || undefined,
                pickingTaskId: ctx.pickingTaskId || undefined,
                packageId: ctx.packageId || undefined,
                countLineId: ctx.countLineId || undefined,
                destinationBin: ctx.destinationBin || undefined,
            })
            const msg = res.duplicate
                ? `Duplicate — prior result reused (${res.status})`
                : `Success: ${operation} posted`
            setFeedback({ type: 'success', message: msg })
            pushToast('success', res.duplicate ? 'Duplicate' : 'OK', msg)
            setBarcode('')
            setHit(null)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Operation failed'
            setFeedback({ type: 'danger', message: Array.isArray(msg) ? msg.join(', ') : msg })
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setConfirming(false)
        }
    }, [barcode, operation, quantity, ctx])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Barcode Scanning"
            description="Resolve any MM identifier and submit scanner operations (receiving, putaway, picking, packing, counting, transfer)."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            onConfirm={onConfirm}
            confirming={confirming}
            confirmLabel="Submit operation"
            feedback={feedback}
        >
            <AdaptiveCard>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Operation">
                        <Select
                            options={OPS}
                            value={OPS.find((o) => o.value === operation)}
                            onChange={(opt: any) => setOperation(opt?.value ?? 'RECEIVING')}
                        />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input
                            className="h-12 text-lg"
                            type="number"
                            value={quantity}
                            onChange={(e: any) => setQuantity(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Warehouse ID / barcode">
                        <Input value={ctx.warehouseId} onChange={(e: any) => setCtx((p) => ({ ...p, warehouseId: e.target.value }))} />
                    </FormItem>
                    <FormItem label="Bin (source / dest for putaway)">
                        <Input value={ctx.bin} onChange={(e: any) => setCtx((p) => ({ ...p, bin: e.target.value }))} />
                    </FormItem>
                    <FormItem label="Batch">
                        <Input value={ctx.batch} onChange={(e: any) => setCtx((p) => ({ ...p, batch: e.target.value }))} />
                    </FormItem>
                    <FormItem label="Serial">
                        <Input value={ctx.serial} onChange={(e: any) => setCtx((p) => ({ ...p, serial: e.target.value }))} />
                    </FormItem>
                    {operation === 'RECEIVING' && (
                        <>
                            <FormItem label="Expected Receipt ID">
                                <Input value={ctx.expectedReceiptId} onChange={(e: any) => setCtx((p) => ({ ...p, expectedReceiptId: e.target.value }))} />
                            </FormItem>
                            <FormItem label="ER Line ID">
                                <Input value={ctx.expectedReceiptLineId} onChange={(e: any) => setCtx((p) => ({ ...p, expectedReceiptLineId: e.target.value }))} />
                            </FormItem>
                        </>
                    )}
                    {operation === 'PUTAWAY' && (
                        <FormItem label="Putaway Task ID">
                            <Input value={ctx.putawayTaskId} onChange={(e: any) => setCtx((p) => ({ ...p, putawayTaskId: e.target.value }))} />
                        </FormItem>
                    )}
                    {operation === 'PICKING' && (
                        <FormItem label="Picking Task ID">
                            <Input value={ctx.pickingTaskId} onChange={(e: any) => setCtx((p) => ({ ...p, pickingTaskId: e.target.value }))} />
                        </FormItem>
                    )}
                    {operation === 'PACKING' && (
                        <FormItem label="Package ID">
                            <Input value={ctx.packageId} onChange={(e: any) => setCtx((p) => ({ ...p, packageId: e.target.value }))} />
                        </FormItem>
                    )}
                    {operation === 'COUNTING' && (
                        <FormItem label="Count Line ID">
                            <Input value={ctx.countLineId} onChange={(e: any) => setCtx((p) => ({ ...p, countLineId: e.target.value }))} />
                        </FormItem>
                    )}
                    {operation === 'TRANSFER' && (
                        <FormItem label="Destination Bin">
                            <Input value={ctx.destinationBin} onChange={(e: any) => setCtx((p) => ({ ...p, destinationBin: e.target.value }))} />
                        </FormItem>
                    )}
                </div>
                {hit && (
                    <pre className="mt-4 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-800">
                        {JSON.stringify(hit, null, 2)}
                    </pre>
                )}
            </AdaptiveCard>
        </MobileScanShell>
    )
}

export default BarcodeScanningPage
