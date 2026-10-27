'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { FormItem } from '@/components/ui/Form'
import MobileScanShell from '../components/MobileScanShell'
import {
    scannerService,
    newIdempotencyKey,
    getScannerUserId,
    getDeviceId,
} from '../services/scannerService'
import { warehouseTaskService } from '../../warehouse/services/warehouseTaskService'

const ROUTE = '/modules/mm/barcode-rfid/mobile-putaway'

const MobilePutawayPage = () => {
    const [barcode, setBarcode] = useState('')
    const [tasks, setTasks] = useState<any[]>([])
    const [taskId, setTaskId] = useState('')
    const [destBin, setDestBin] = useState('')
    const [qty, setQty] = useState('1')
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
        title?: string
    } | null>(null)

    const load = useCallback(() => {
        warehouseTaskService
            .myTasks({ taskType: 'PUTAWAY', limit: 50 } as any)
            .then((r: any) =>
                setTasks(
                    (r.data ?? r ?? []).filter(
                        (t: any) => !['COMPLETED', 'CANCELLED'].includes(t.status),
                    ),
                ),
            )
            .catch(() => {})
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const taskOpts = useMemo(
        () =>
            tasks.map((t) => ({
                value: t.id,
                label: `${t.taskNumber ?? t.id} · ${t.material?.materialCode ?? t.materialId ?? ''}`,
            })),
        [tasks],
    )

    const onScan = useCallback(
        async (barcodeOverride?: string) => {
            const code = (barcodeOverride ?? barcode).trim()
            if (!code) return
            setScanning(true)
            try {
                const r = await scannerService.resolve(code)
                if (r.putawayTaskId || r.warehouseTaskId) {
                    setTaskId(r.putawayTaskId ?? r.warehouseTaskId ?? '')
                    setFeedback({
                        type: 'success',
                        message: `Putaway task ${r.documentNumber ?? r.putawayTaskId}`,
                    })
                    load()
                } else if (r.type === 'STORAGE_BIN' || r.storageBinId) {
                    setDestBin(r.storageBin?.code ?? r.storageBin?.barcode ?? code)
                    setFeedback({
                        type: 'success',
                        message: `Destination bin ${r.storageBin?.code ?? code}`,
                    })
                } else {
                    setFeedback({
                        type: 'info',
                        message: `Resolved: ${r.type}`,
                    })
                }
            } catch (e: any) {
                setFeedback({
                    type: 'danger',
                    message: e?.response?.data?.message ?? e.message ?? 'Scan failed',
                })
            } finally {
                setScanning(false)
                setBarcode('')
            }
        },
        [barcode, load],
    )

    const confirmPutaway = useCallback(async () => {
        if (!taskId) {
            setFeedback({ type: 'danger', message: 'Select a putaway task first.' })
            return
        }
        setConfirming(true)
        try {
            const result = await scannerService.putawayScan({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation: 'PUTAWAY',
                barcode: barcode || 'MANUAL',
                timestamp: new Date().toISOString(),
                putawayTaskId: taskId,
                bin: destBin,
                quantity: Number(qty) || 1,
                idempotencyKey: newIdempotencyKey(),
            })
            setFeedback({
                type: 'success',
                title: 'Putaway posted',
                message: result.status === 'SUCCESS' ? 'Movement confirmed via putaway service.' : String(result.status),
            })
            load()
        } catch (e: any) {
            setFeedback({
                type: 'danger',
                message: e?.response?.data?.message ?? e.message ?? 'Putaway failed',
            })
        } finally {
            setConfirming(false)
        }
    }, [taskId, destBin, qty, barcode, load])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Mobile Putaway"
            icon="warehouse"
            workflowLabel="Dock to stock"
            description="Scan putaway tasks and destination bins; confirmations post through PutawayService and InventoryPostingService."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={() => onScan()}
            scanning={scanning}
            feedback={feedback}
        >
            <FormItem label="Putaway task">
                <Select
                    options={taskOpts}
                    value={taskOpts.find((o) => o.value === taskId) ?? null}
                    onChange={(o: any) => setTaskId(o?.value ?? '')}
                />
            </FormItem>
            <FormItem label="Destination bin (scan or type)">
                <Input value={destBin} onChange={(e: any) => setDestBin(e.target.value)} />
            </FormItem>
            <FormItem label="Quantity">
                <Input value={qty} onChange={(e: any) => setQty(e.target.value)} />
            </FormItem>
            <Button block variant="solid" loading={confirming} onClick={confirmPutaway}>
                Confirm putaway
            </Button>
        </MobileScanShell>
    )
}

export default MobilePutawayPage
