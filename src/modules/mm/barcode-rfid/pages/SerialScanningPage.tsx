'use client'

import { useCallback, useState } from 'react'
import MobileScanShell from '../components/MobileScanShell'
import ScanResolveResultCard from '../components/ScanResolveResultCard'
import ScanEmptyState from '../components/ScanEmptyState'
import { scannerService } from '../services/scannerService'
import type { ResolveHit } from '../types'

const ROUTE = '/modules/mm/barcode-rfid/serial-scanning'

const SerialScanningPage = () => {
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
                if (r.type !== 'SERIAL' && !r.serialNumberId) {
                    setFeedback({
                        type: 'danger',
                        title: 'Wrong identifier type',
                        message: `Expected a serial barcode. Resolver returned ${r.type}.`,
                    })
                    setHit(r)
                    return
                }
                setHit(r)
                setFeedback({
                    type: 'success',
                    title: 'Serial resolved',
                    message: `${r.serial?.serialNumber ?? r.barcode} · material ${r.material?.materialCode ?? r.materialId ?? '—'}`,
                })
            } catch (err: any) {
                setHit(null)
                setFeedback({
                    type: 'danger',
                    title: 'Lookup failed',
                    message: err?.response?.data?.message || 'Not found',
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
            title="Serial Scanning"
            icon="clipboard"
            workflowLabel="Unit identification"
            description="Validate serialized unit barcodes against MM before warehouse operations."
            workflowSteps={[
                'Scan serial label',
                'Verify material',
                'Apply on receiving or picking',
            ]}
            barcode={barcode}
            onBarcodeChange={setBarcode}
            onScan={onScan}
            scanning={scanning}
            feedback={feedback}
        >
            {hit && (hit.type === 'SERIAL' || hit.serialNumberId) ? (
                <ScanResolveResultCard hit={hit} variant="serial" />
            ) : (
                <ScanEmptyState
                    title="Serial details will appear here"
                    description="Scan a serial-managed unit to view serial number, material, and traceability IDs."
                />
            )}
        </MobileScanShell>
    )
}

export default SerialScanningPage
