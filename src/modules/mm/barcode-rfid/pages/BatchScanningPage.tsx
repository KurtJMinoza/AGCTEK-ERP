'use client'

import { useCallback, useState } from 'react'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import MobileScanShell from '../components/MobileScanShell'
import ScanResolveResultCard from '../components/ScanResolveResultCard'
import ScanEmptyState from '../components/ScanEmptyState'
import { scannerService } from '../services/scannerService'
import type { ResolveHit } from '../types'

const ROUTE = '/modules/mm/barcode-rfid/batch-scanning'

const BatchScanningPage = () => {
    const [barcode, setBarcode] = useState('')
    const [hit, setHit] = useState<ResolveHit | null>(null)
    const [scanning, setScanning] = useState(false)
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'danger' | 'info'
        message: string
        title?: string
    } | null>(null)

    const onScan = useCallback(
        async (barcodeOverride?: string) => {
            const code = (barcodeOverride ?? barcode).trim()
            if (!code) return
            setScanning(true)
            setFeedback(null)
            try {
                const r = await scannerService.resolve(code)
                if (r.type !== 'BATCH' && !r.batchId) {
                    setFeedback({
                        type: 'danger',
                        title: 'Wrong identifier type',
                        message: `Expected a batch barcode. Resolver returned ${r.type}.`,
                    })
                    toast.push(
                        <Notification type="danger" title="Not a batch">
                            Got {r.type}
                        </Notification>,
                        { placement: 'top-end' },
                    )
                    setHit(r)
                    return
                }
                setHit(r)
                setFeedback({
                    type: 'success',
                    title: 'Batch resolved',
                    message: `${r.batch?.batchNumber ?? r.barcode} linked to material ${r.material?.materialCode ?? r.materialId ?? '—'}.`,
                })
            } catch (err: any) {
                setHit(null)
                const msg = err?.response?.data?.message || 'Barcode not found'
                setFeedback({
                    type: 'danger',
                    title: 'Lookup failed',
                    message: Array.isArray(msg) ? msg.join(', ') : msg,
                })
            } finally {
                setScanning(false)
            }
        },
        [barcode],
    )

    return (
        <MobileScanShell
            route={ROUTE}
            title="Batch Scanning"
            icon="layers"
            workflowLabel="Lot identification"
            description="Validate batch barcodes against MM master data before receiving, picking, or transfer."
            workflowSteps={[
                'Scan batch label',
                'Confirm material match',
                'Use on mobile receiving or picking',
            ]}
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            feedback={feedback}
        >
            {hit && (hit.type === 'BATCH' || hit.batchId) ? (
                <ScanResolveResultCard hit={hit} variant="batch" />
            ) : (
                <ScanEmptyState
                    title="Batch details will appear here"
                    description="Scan a lot-managed batch barcode to view batch number, material, and warehouse context."
                />
            )}
        </MobileScanShell>
    )
}

export default BatchScanningPage
