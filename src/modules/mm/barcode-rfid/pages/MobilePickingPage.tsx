'use client'

import { useCallback, useEffect, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
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
import { pickingService } from '../../warehouse/services/pickingService'

const ROUTE = '/modules/mm/barcode-rfid/mobile-picking'

const MobilePickingPage = () => {
    const [barcode, setBarcode] = useState('')
    const [tasks, setTasks] = useState<any[]>([])
    const [taskId, setTaskId] = useState('')
    const [bin, setBin] = useState('')
    const [batch, setBatch] = useState('')
    const [serial, setSerial] = useState('')
    const [materialBarcode, setMaterialBarcode] = useState('')
    const [qty, setQty] = useState('1')
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
    } | null>(null)

    const load = useCallback(() => {
        pickingService
            .list({ limit: 50 } as any)
            .then((r: any) =>
                setTasks(
                    (r.data ?? r ?? []).filter(
                        (t: any) =>
                            !['COMPLETED', 'CANCELLED'].includes(t.status),
                    ),
                ),
            )
            .catch(() => {})
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const selected = tasks.find((t) => t.id === taskId)

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        try {
            const r = await scannerService.resolve(barcode.trim())
            if (r.type === 'PICKING_TASK' && r.pickingTaskId) {
                setTaskId(r.pickingTaskId)
                if (r.storageBinId) setBin(r.storageBinId)
                setFeedback({
                    type: 'success',
                    message: `Task ${r.documentNumber ?? r.pickingTaskId}`,
                })
                load()
            } else if (r.type === 'STORAGE_BIN' && (r.storageBinId || r.storageBin)) {
                setBin(r.storageBin?.barcode ?? r.storageBin?.code ?? r.barcode)
                setFeedback({
                    type: 'success',
                    message: `Bin ${r.storageBin?.code ?? r.barcode}`,
                })
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
                    message: `Material ${r.material?.materialCode ?? r.materialId}`,
                })
                if (selected && selected.materialId !== r.materialId) {
                    setFeedback({
                        type: 'danger',
                        message: 'WRONG_MATERIAL: does not match task',
                    })
                }
            } else {
                setFeedback({ type: 'info', message: `Resolved ${r.type}` })
            }
        } catch (err: any) {
            setFeedback({
                type: 'danger',
                message: err?.response?.data?.message || 'Not found',
            })
        } finally {
            setScanning(false)
        }
    }, [barcode, selected, load])

    const onConfirm = useCallback(async () => {
        if (!taskId) {
            setFeedback({ type: 'danger', message: 'Select a pick task' })
            return
        }
        if (!bin.trim()) {
            setFeedback({
                type: 'danger',
                message: 'WRONG_BIN: Scan source bin before confirm',
            })
            return
        }
        setConfirming(true)
        try {
            const res = await scannerService.postEvent({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation: 'PICKING',
                barcode:
                    materialBarcode ||
                    barcode.trim() ||
                    selected?.materialId ||
                    'PICK',
                timestamp: new Date().toISOString(),
                quantity: Number(qty),
                bin: bin || undefined,
                batch: batch || undefined,
                serial: serial || undefined,
                idempotencyKey: newIdempotencyKey('pick'),
                pickingTaskId: taskId,
            })
            const msg = res.duplicate ? 'Duplicate pick ignored' : 'Pick confirmed'
            setFeedback({ type: 'success', message: msg })
            toast.push(
                <Notification type="success" title="Pick">
                    {msg}
                </Notification>,
                { placement: 'top-end' },
            )
            setBarcode('')
            setMaterialBarcode('')
            load()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            setFeedback({
                type: 'danger',
                message: Array.isArray(msg) ? msg.join(', ') : msg,
            })
        } finally {
            setConfirming(false)
        }
    }, [
        taskId,
        barcode,
        materialBarcode,
        qty,
        bin,
        batch,
        serial,
        selected,
        load,
    ])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Mobile Picking"
            description="Scan task → source bin → material → batch/serial → qty → confirm."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            onConfirm={onConfirm}
            confirming={confirming}
            confirmLabel="Confirm pick"
            feedback={feedback}
        >
            <AdaptiveCard className="mb-4">
                <FormItem label="Source bin (required)">
                    <Input
                        className="h-12 text-lg"
                        value={bin}
                        onChange={(e: any) => setBin(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Batch">
                    <Input
                        className="h-12"
                        value={batch}
                        onChange={(e: any) => setBatch(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Serial">
                    <Input
                        className="h-12"
                        value={serial}
                        onChange={(e: any) => setSerial(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Picked qty">
                    <Input
                        className="h-14 text-2xl"
                        type="number"
                        value={qty}
                        onChange={(e: any) => setQty(e.target.value)}
                    />
                </FormItem>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable
                    columns={
                        [
                            {
                                header: 'Task',
                                cell: ({ row }: any) =>
                                    row.original.taskNumber ??
                                    row.original.id.slice(0, 8),
                            },
                            {
                                header: 'Material',
                                cell: ({ row }: any) =>
                                    row.original.material?.materialCode ??
                                    row.original.materialId,
                            },
                            {
                                header: 'Qty',
                                cell: ({ row }: any) =>
                                    Number(
                                        row.original.requiredQty ??
                                            row.original.quantity ??
                                            0,
                                    ),
                            },
                            {
                                header: 'Status',
                                cell: ({ row }: any) => (
                                    <StatusBadge tone="warning">
                                        {row.original.status}
                                    </StatusBadge>
                                ),
                            },
                            {
                                header: '',
                                id: 'sel',
                                cell: ({ row }: any) => (
                                    <Button
                                        size="sm"
                                        variant={
                                            taskId === row.original.id
                                                ? 'solid'
                                                : 'default'
                                        }
                                        onClick={() => {
                                            setTaskId(row.original.id)
                                            setQty(
                                                String(
                                                    row.original.requiredQty ??
                                                        row.original.quantity ??
                                                        1,
                                                ),
                                            )
                                            if (row.original.sourceBinId) {
                                                setBin(row.original.sourceBinId)
                                            }
                                        }}
                                    >
                                        Select
                                    </Button>
                                ),
                            },
                        ] as ColumnDef<any>[]
                    }
                    data={tasks}
                />
            </AdaptiveCard>
        </MobileScanShell>
    )
}

export default MobilePickingPage
