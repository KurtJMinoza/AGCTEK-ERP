'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Alert from '@/components/ui/Alert'
import StatusBadge from '@/components/shared/StatusBadge'
import InfoCard from '@/modules/mm/shared/InfoCard'
import type { ResolveHit } from '../types'

type Variant = 'batch' | 'serial'

type ScanResolveResultCardProps = {
    hit: ResolveHit
    variant: Variant
    hint?: string
}

const variantCopy: Record<
    Variant,
    { title: string; primaryLabel: string; defaultHint: string }
> = {
    batch: {
        title: 'Batch identified',
        primaryLabel: 'Batch number',
        defaultHint:
            'Use this batch on Mobile Receiving or Picking when the material is lot-managed.',
    },
    serial: {
        title: 'Serial identified',
        primaryLabel: 'Serial number',
        defaultHint:
            'Use this serial on Mobile Receiving or Picking when the material is serial-managed.',
    },
}

const ScanResolveResultCard = ({
    hit,
    variant,
    hint,
}: ScanResolveResultCardProps) => {
    const copy = variantCopy[variant]
    const primaryValue =
        variant === 'batch'
            ? hit.batch?.batchNumber
            : hit.serial?.serialNumber
    const materialLabel = hit.material
        ? `${hit.material.materialCode} — ${hit.material.materialName}`
        : hit.materialId

    return (
        <AdaptiveCard
            header={{
                content: (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h4 className="text-base font-semibold heading-text">
                                {copy.title}
                            </h4>
                            <p className="mt-0.5 font-mono text-sm text-gray-600 dark:text-gray-300">
                                {hit.barcode}
                            </p>
                        </div>
                        <StatusBadge tone="info">{hit.type}</StatusBadge>
                    </div>
                ),
            }}
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoCard label={copy.primaryLabel} value={primaryValue ?? '—'} />
                <InfoCard label="Material" value={materialLabel ?? '—'} />
                <InfoCard
                    label={variant === 'batch' ? 'Batch ID' : 'Serial ID'}
                    value={
                        variant === 'batch'
                            ? hit.batchId
                            : hit.serialNumberId
                    }
                />
                <InfoCard
                    label="Warehouse"
                    value={hit.warehouse?.code ?? hit.warehouseId}
                />
            </div>
            <Alert
                showIcon
                type="info"
                className="mt-4"
                title="Next step"
            >
                {hint ?? copy.defaultHint}
            </Alert>
        </AdaptiveCard>
    )
}

export default ScanResolveResultCard
