'use client'

import { useCallback, useEffect, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
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
import { inventoryControlService } from '../../inventory-control/services/inventoryControlService'

const ROUTE = '/modules/mm/barcode-rfid/mobile-counting'

const MobileCountingPage = () => {
    const [barcode, setBarcode] = useState('')
    const [counts, setCounts] = useState<any[]>([])
    const [lines, setLines] = useState<any[]>([])
    const [activeCountId, setActiveCountId] = useState('')
    const [lineId, setLineId] = useState('')
    const [bin, setBin] = useState('')
    const [qty, setQty] = useState('0')
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
    } | null>(null)

    const loadCount = useCallback(async (id: string) => {
        try {
            const detail = await inventoryControlService.getCount(id, true)
            setActiveCountId(id)
            setLines(detail.lines ?? [])
        } catch {
            /* ignore */
        }
    }, [])

    useEffect(() => {
        inventoryControlService
            .listCounts({ limit: 30 } as any)
            .then(async (r) => {
                const open = (r.data ?? []).filter((c) =>
                    ['OPEN', 'COUNTING', 'IN_PROGRESS'].includes(c.status),
                )
                setCounts(open)
                if (open[0]) await loadCount(open[0].id)
            })
            .catch(() => {})
    }, [loadCount])

    const selectedLine = lines.find((l) => l.id === lineId)

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        try {
            const r = await scannerService.resolve(barcode.trim())
            if (r.type === 'INVENTORY_COUNT' && r.countId) {
                await loadCount(r.countId)
                setFeedback({
                    type: 'success',
                    message: `Count ${r.documentNumber ?? r.countId}`,
                })
            } else if (r.type === 'INVENTORY_COUNT_LINE' && r.countLineId) {
                setLineId(r.countLineId)
                if (r.storageBinId) setBin(r.storageBinId)
                setFeedback({
                    type: 'success',
                    message: `Count line selected`,
                })
            } else if (r.type === 'STORAGE_BIN') {
                setBin(r.storageBin?.barcode ?? r.storageBin?.code ?? r.barcode)
                if (
                    selectedLine?.storageBinId &&
                    r.storageBinId &&
                    selectedLine.storageBinId !== r.storageBinId
                ) {
                    setFeedback({
                        type: 'danger',
                        message: 'WRONG_BIN: does not match count line',
                    })
                } else {
                    setFeedback({
                        type: 'success',
                        message: `Bin ${r.storageBin?.code ?? r.barcode}`,
                    })
                }
            } else if (r.materialId) {
                const match = lines.find((l) => l.materialId === r.materialId)
                if (match) {
                    setLineId(match.id)
                    if (match.storageBinId) setBin(match.storageBinId)
                    setFeedback({
                        type: 'success',
                        message: `Matched line for ${r.material?.materialCode}`,
                    })
                } else {
                    setFeedback({
                        type: 'danger',
                        message: 'No count line for this material',
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
    }, [barcode, lines, selectedLine, loadCount])

    const onConfirm = useCallback(async () => {
        if (!lineId) {
            setFeedback({ type: 'danger', message: 'Select a count line' })
            return
        }
        if (selectedLine?.storageBinId && !bin.trim()) {
            setFeedback({
                type: 'danger',
                message: 'WRONG_BIN: Scan bin for this count line',
            })
            return
        }
        setConfirming(true)
        try {
            const res = await scannerService.postEvent({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation: 'COUNTING',
                barcode: barcode.trim() || 'COUNT',
                timestamp: new Date().toISOString(),
                quantity: Number(qty),
                bin: bin || undefined,
                idempotencyKey: newIdempotencyKey('count'),
                countLineId: lineId,
            })
            const msg = res.duplicate ? 'Duplicate count ignored' : 'Count recorded'
            setFeedback({ type: 'success', message: msg })
            toast.push(
                <Notification type="success" title="Count">
                    {msg}
                </Notification>,
                { placement: 'top-end' },
            )
            setBarcode('')
            if (activeCountId) loadCount(activeCountId)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Failed'
            setFeedback({
                type: 'danger',
                message: Array.isArray(msg) ? msg.join(', ') : msg,
            })
        } finally {
            setConfirming(false)
        }
    }, [lineId, barcode, qty, bin, selectedLine, activeCountId, loadCount])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Mobile Counting"
            description="Scan count/bin/material → enter qty → confirm via cycle count."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            onConfirm={onConfirm}
            confirming={confirming}
            confirmLabel="Submit count"
            feedback={feedback}
        >
            <AdaptiveCard className="mb-4">
                <FormItem label="Bin (when line has bin)">
                    <Input
                        className="h-12"
                        value={bin}
                        onChange={(e: any) => setBin(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Counted quantity">
                    <Input
                        className="h-16 text-3xl font-bold"
                        type="number"
                        value={qty}
                        onChange={(e: any) => setQty(e.target.value)}
                    />
                </FormItem>
                {counts.length > 1 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {counts.map((c) => (
                            <Button
                                key={c.id}
                                size="sm"
                                variant={
                                    activeCountId === c.id ? 'solid' : 'default'
                                }
                                onClick={() => loadCount(c.id)}
                            >
                                {c.countNumber}
                            </Button>
                        ))}
                    </div>
                )}
            </AdaptiveCard>
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
                                header: 'Bin',
                                cell: ({ row }: any) =>
                                    row.original.storageBin?.code ?? '—',
                            },
                            {
                                header: '',
                                id: 'sel',
                                cell: ({ row }: any) => (
                                    <Button
                                        size="sm"
                                        variant={
                                            lineId === row.original.id
                                                ? 'solid'
                                                : 'default'
                                        }
                                        onClick={() => {
                                            setLineId(row.original.id)
                                            if (row.original.storageBinId) {
                                                setBin(row.original.storageBinId)
                                            }
                                        }}
                                    >
                                        Select
                                    </Button>
                                ),
                            },
                        ] as ColumnDef<any>[]
                    }
                    data={lines}
                />
            </AdaptiveCard>
        </MobileScanShell>
    )
}

export default MobileCountingPage
