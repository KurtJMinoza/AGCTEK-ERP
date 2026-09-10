'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import MobileScanShell from '../components/MobileScanShell'
import {
    scannerService,
    newIdempotencyKey,
    getScannerUserId,
    getDeviceId,
} from '../services/scannerService'
import { inboundService } from '../../receiving/services/inboundService'

const ROUTE = '/modules/mm/barcode-rfid/mobile-receiving'

const MobileReceivingPage = () => {
    const [barcode, setBarcode] = useState('')
    const [ers, setErs] = useState<any[]>([])
    const [erId, setErId] = useState('')
    const [lineId, setLineId] = useState('')
    const [qty, setQty] = useState('1')
    const [batch, setBatch] = useState('')
    const [serial, setSerial] = useState('')
    const [materialBarcode, setMaterialBarcode] = useState('')
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
    } | null>(null)

    const reloadErs = useCallback(() => {
        inboundService
            .listExpectedReceipts({ pageSize: 50 } as any)
            .then((r: any) => setErs(r.data ?? r ?? []))
            .catch(() => {})
    }, [])

    useEffect(() => {
        reloadErs()
    }, [reloadErs])

    const erOpts = useMemo(
        () => ers.map((e) => ({ value: e.id, label: e.documentNumber || e.id })),
        [ers],
    )
    const selectedEr = ers.find((e) => e.id === erId)
    const lineOpts = useMemo(
        () =>
            (selectedEr?.lines ?? []).map((l: any) => ({
                value: l.id,
                label: `${l.material?.materialCode ?? l.materialId} · rem ${Number(l.expectedQuantity) - Number(l.receivedQuantity || 0)}`,
            })),
        [selectedEr],
    )

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        try {
            const r = await scannerService.resolve(barcode.trim())
            if (r.type === 'EXPECTED_RECEIPT' && r.expectedReceiptId) {
                setErId(r.expectedReceiptId)
                setLineId('')
                setFeedback({
                    type: 'success',
                    message: `ER ${r.documentNumber ?? r.expectedReceiptId}`,
                })
                reloadErs()
            } else if (r.type === 'PURCHASE_ORDER') {
                const match = ers.find(
                    (e) => e.purchaseOrderId === r.purchaseOrderId,
                )
                if (match) {
                    setErId(match.id)
                    setFeedback({
                        type: 'success',
                        message: `PO ${r.documentNumber} → ER ${match.documentNumber}`,
                    })
                } else {
                    setFeedback({
                        type: 'info',
                        message: `PO ${r.documentNumber} — select matching ER`,
                    })
                }
            } else if (r.type === 'BATCH' || r.batchId) {
                setBatch(r.batch?.batchNumber ?? r.barcode)
                setFeedback({
                    type: 'success',
                    message: `Batch ${r.batch?.batchNumber ?? r.barcode}`,
                })
            } else if (r.type === 'SERIAL' || r.serialNumberId) {
                setSerial(r.serial?.serialNumber ?? r.barcode)
                setFeedback({
                    type: 'success',
                    message: `Serial ${r.serial?.serialNumber ?? r.barcode}`,
                })
            } else if (r.materialId) {
                setMaterialBarcode(barcode.trim())
                setFeedback({
                    type: 'success',
                    message: `Material: ${r.material?.materialCode ?? r.type}`,
                })
                const er = ers.find((e) => e.id === erId) ?? selectedEr
                if (er?.lines) {
                    const match = er.lines.find(
                        (l: any) => l.materialId === r.materialId,
                    )
                    if (match) setLineId(match.id)
                }
            } else {
                setFeedback({ type: 'info', message: `Resolved ${r.type}` })
            }
        } catch (err: any) {
            setFeedback({
                type: 'danger',
                message: err?.response?.data?.message || 'INVALID_BARCODE',
            })
        } finally {
            setScanning(false)
        }
    }, [barcode, ers, erId, selectedEr, reloadErs])

    const onConfirm = useCallback(async () => {
        if (!erId || !lineId) {
            setFeedback({
                type: 'danger',
                message: 'Select expected receipt and line',
            })
            return
        }
        setConfirming(true)
        try {
            const res = await scannerService.postEvent({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation: 'RECEIVING',
                barcode: materialBarcode || barcode.trim() || 'MANUAL',
                timestamp: new Date().toISOString(),
                quantity: Number(qty),
                batch: batch || undefined,
                serial: serial || undefined,
                idempotencyKey: newIdempotencyKey('recv'),
                expectedReceiptId: erId,
                expectedReceiptLineId: lineId,
            })
            const msg = res.duplicate
                ? 'Duplicate receive ignored'
                : 'Receive recorded (draft GR)'
            setFeedback({ type: 'success', message: msg })
            toast.push(
                <Notification type="success" title="Receive">
                    {msg}
                </Notification>,
                { placement: 'top-end' },
            )
            setBarcode('')
            setMaterialBarcode('')
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            setFeedback({
                type: 'danger',
                message: Array.isArray(msg) ? msg.join(', ') : msg,
            })
        } finally {
            setConfirming(false)
        }
    }, [erId, lineId, barcode, materialBarcode, qty, batch, serial])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Mobile Receiving"
            description="Scan PO/ER → material → qty → batch/serial → confirm (existing GR path)."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            onConfirm={onConfirm}
            confirming={confirming}
            confirmLabel="Confirm receive"
            feedback={feedback}
        >
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-4">
                    <FormItem label="Expected Receipt (or scan ER/PO)">
                        <Select
                            options={erOpts}
                            value={erOpts.find((o) => o.value === erId)}
                            onChange={(opt: any) => {
                                setErId(opt?.value ?? '')
                                setLineId('')
                            }}
                        />
                    </FormItem>
                    <FormItem label="Line">
                        <Select
                            options={lineOpts}
                            value={lineOpts.find((o: any) => o.value === lineId)}
                            onChange={(opt: any) => setLineId(opt?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input
                            className="h-14 text-2xl"
                            type="number"
                            value={qty}
                            onChange={(e: any) => setQty(e.target.value)}
                        />
                    </FormItem>
                    <FormItem label="Batch (if required)">
                        <Input
                            className="h-12"
                            value={batch}
                            onChange={(e: any) => setBatch(e.target.value)}
                            placeholder="Scan batch barcode"
                        />
                    </FormItem>
                    <FormItem label="Serial (if required)">
                        <Input
                            className="h-12"
                            value={serial}
                            onChange={(e: any) => setSerial(e.target.value)}
                            placeholder="Scan serial barcode"
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>
            {selectedEr?.lines && (
                <AdaptiveCard>
                    <DataTable
                        columns={
                            [
                                {
                                    header: 'Material',
                                    cell: ({ row }: any) =>
                                        row.original.material?.materialCode ??
                                        row.original.materialId,
                                },
                                {
                                    header: 'Expected',
                                    accessorKey: 'expectedQuantity',
                                },
                                {
                                    header: 'Received',
                                    accessorKey: 'receivedQuantity',
                                },
                                {
                                    header: '',
                                    id: 'pick',
                                    cell: ({ row }: any) => (
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                setLineId(row.original.id)
                                            }
                                        >
                                            Use
                                        </Button>
                                    ),
                                },
                            ] as ColumnDef<any>[]
                        }
                        data={selectedEr.lines}
                    />
                </AdaptiveCard>
            )}
        </MobileScanShell>
    )
}

export default MobileReceivingPage
