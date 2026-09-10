'use client'

import { useCallback, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MobileScanShell from '../components/MobileScanShell'
import { scannerService } from '../services/scannerService'
import type { ResolveHit } from '../types'

const ROUTE = '/modules/mm/barcode-rfid/serial-scanning'

const SerialScanningPage = () => {
    const [barcode, setBarcode] = useState('')
    const [hit, setHit] = useState<ResolveHit | null>(null)
    const [scanning, setScanning] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'danger' | 'info'; message: string } | null>(null)

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        try {
            const r = await scannerService.resolve(barcode.trim())
            if (r.type !== 'SERIAL' && !r.serialNumberId) {
                setFeedback({ type: 'danger', message: `Expected serial barcode, got ${r.type}` })
                setHit(r)
                return
            }
            setHit(r)
            setFeedback({
                type: 'success',
                message: `Serial ${r.serial?.serialNumber ?? r.barcode} · material ${r.materialId}`,
            })
        } catch (err: any) {
            setFeedback({ type: 'danger', message: err?.response?.data?.message || 'Not found' })
        } finally {
            setScanning(false)
        }
    }, [barcode])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Serial Scanning"
            description="Scan serial numbers for serialized materials."
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            feedback={feedback}
        >
            {hit && (
                <AdaptiveCard>
                    <dl className="grid grid-cols-2 gap-3 text-base">
                        <div><dt className="text-gray-500">Type</dt><dd className="font-semibold">{hit.type}</dd></div>
                        <div><dt className="text-gray-500">Serial</dt><dd className="font-semibold">{hit.serial?.serialNumber ?? '—'}</dd></div>
                        <div><dt className="text-gray-500">Serial ID</dt><dd className="font-mono text-sm break-all">{hit.serialNumberId ?? '—'}</dd></div>
                        <div><dt className="text-gray-500">Material ID</dt><dd className="font-mono text-sm break-all">{hit.materialId ?? '—'}</dd></div>
                    </dl>
                    <p className="mt-3 text-sm text-gray-500">
                        Copy serial into Mobile Receiving / Picking when the material is serial-managed.
                    </p>
                </AdaptiveCard>
            )}
        </MobileScanShell>
    )
}

export default SerialScanningPage
