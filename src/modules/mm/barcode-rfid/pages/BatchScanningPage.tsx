'use client'

import { useCallback, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MobileScanShell from '../components/MobileScanShell'
import { scannerService } from '../services/scannerService'
import type { ResolveHit } from '../types'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

const ROUTE = '/modules/mm/barcode-rfid/batch-scanning'

const BatchScanningPage = () => {
    const [barcode, setBarcode] = useState('')
    const [hit, setHit] = useState<ResolveHit | null>(null)
    const [scanning, setScanning] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'danger' | 'info'; message: string } | null>(null)

    const onScan = useCallback(async () => {
        if (!barcode.trim()) return
        setScanning(true)
        try {
            const r = await scannerService.resolve(barcode.trim())
            if (r.type !== 'BATCH' && !r.batchId) {
                setFeedback({ type: 'danger', message: `Expected batch barcode, got ${r.type}` })
                toast.push(<Notification type="danger" title="Not a batch">{`Got ${r.type}`}</Notification>, { placement: 'top-end' })
                setHit(r)
                return
            }
            setHit(r)
            setFeedback({
                type: 'success',
                message: `Batch ${r.batch?.batchNumber ?? r.barcode} · material ${r.materialId}`,
            })
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Not found'
            setFeedback({ type: 'danger', message: msg })
        } finally {
            setScanning(false)
        }
    }, [barcode])

    return (
        <MobileScanShell
            route={ROUTE}
            title="Batch Scanning"
            description="Scan batch barcodes to identify lot-controlled stock."
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
                        <div><dt className="text-gray-500">Batch</dt><dd className="font-semibold">{hit.batch?.batchNumber ?? '—'}</dd></div>
                        <div><dt className="text-gray-500">Batch ID</dt><dd className="font-mono text-sm break-all">{hit.batchId ?? '—'}</dd></div>
                        <div><dt className="text-gray-500">Material ID</dt><dd className="font-mono text-sm break-all">{hit.materialId ?? '—'}</dd></div>
                    </dl>
                    <p className="mt-3 text-sm text-gray-500">
                        Copy batch number into Mobile Receiving / Picking when the material is batch-managed.
                    </p>
                </AdaptiveCard>
            )}
        </MobileScanShell>
    )
}

export default BatchScanningPage
