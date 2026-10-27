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
import { packingService } from '../../warehouse/services/packingService'

const ROUTE = '/modules/mm/barcode-rfid/mobile-packing'

const MobilePackingPage = () => {
    const [barcode, setBarcode] = useState('')
    const [packages, setPackages] = useState<any[]>([])
    const [packageId, setPackageId] = useState('')
    const [qty, setQty] = useState('1')
    const [scanning, setScanning] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
        title?: string
    } | null>(null)

    const load = useCallback(() => {
        packingService
            .list({ status: 'OPEN', pageSize: 50 } as any)
            .then((r: any) => {
                const open = (r.data ?? []).filter(
                    (p: any) => p.status === 'OPEN' || p.status === 'PACKING',
                )
                setPackages(open)
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const pkgOpts = useMemo(
        () =>
            packages.map((p) => ({
                value: p.id,
                label: `${p.packageNumber ?? p.id} · ${p.status}`,
            })),
        [packages],
    )

    const onScan = useCallback(
        async (barcodeOverride?: string) => {
            const code = (barcodeOverride ?? barcode).trim()
            if (!code) return
            setScanning(true)
            try {
                const r = await scannerService.resolve(code)
                if (r.packageId) {
                    setPackageId(r.packageId)
                    setFeedback({
                        type: 'success',
                        message: `Package ${r.documentNumber ?? r.packageId}`,
                    })
                } else if (packageId && r.materialId) {
                    setBarcode(code)
                    setFeedback({
                        type: 'success',
                        message: `Material ${r.material?.materialCode ?? r.materialId}`,
                    })
                } else {
                    setBarcode(code)
                    setFeedback({ type: 'info', message: `Resolved ${r.type}` })
                }
            } catch (e: any) {
                setFeedback({
                    type: 'danger',
                    message: e?.response?.data?.message ?? e.message ?? 'Scan failed',
                })
            } finally {
                setScanning(false)
            }
        },
        [barcode, packageId],
    )

    const confirmScan = useCallback(async () => {
        if (!packageId) {
            setFeedback({ type: 'danger', message: 'Select or scan a package first.' })
            return
        }
        if (!barcode.trim()) {
            setFeedback({ type: 'danger', message: 'Scan material barcode.' })
            return
        }
        setConfirming(true)
        try {
            const result = await scannerService.packingScan({
                deviceId: getDeviceId(),
                userId: getScannerUserId(),
                operation: 'PACKING',
                barcode: barcode.trim(),
                timestamp: new Date().toISOString(),
                packageId,
                quantity: Number(qty) || 1,
                idempotencyKey: newIdempotencyKey(),
            })
            const progress = (result.result as any)?.progress
            setFeedback({
                type: 'success',
                title: 'Packed',
                message: progress
                    ? `Scanned ${progress.totalScanned}/${progress.totalExpected}`
                    : 'Scan recorded',
            })
            setBarcode('')
            load()
        } catch (e: any) {
            setFeedback({
                type: 'danger',
                message: e?.response?.data?.message ?? e.message ?? 'Packing scan failed',
            })
        } finally {
            setConfirming(false)
        }
    }, [packageId, barcode, qty, load])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Mobile Packing"
            icon="package"
            workflowLabel="Outbound packing"
            description="Scan open packages and materials; packed quantity cannot exceed picked quantity."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={() => onScan()}
            scanning={scanning}
            feedback={feedback}
        >
            <FormItem label="Package">
                <Select
                    options={pkgOpts}
                    value={pkgOpts.find((o) => o.value === packageId) ?? null}
                    onChange={(o: any) => setPackageId(o?.value ?? '')}
                />
            </FormItem>
            <FormItem label="Quantity per scan">
                <Input value={qty} onChange={(e: any) => setQty(e.target.value)} />
            </FormItem>
            <Button block variant="solid" loading={confirming} onClick={confirmScan}>
                Validate &amp; pack scan
            </Button>
        </MobileScanShell>
    )
}

export default MobilePackingPage
