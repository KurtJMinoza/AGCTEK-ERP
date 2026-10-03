'use client'

import type { ReactNode } from 'react'
import type { MaterialCatalogReference } from '../services/materialCatalogReferenceService'

const fmtNum = (n: number, digits = 2) =>
    new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    }).format(n)

const fmtMoney = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: currency.length === 3 ? currency : 'PHP',
    }).format(amount)

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    } catch {
        return '—'
    }
}

const uomLabel = (code: string | null, name: string | null) => {
    if (!code && !name) return '—'
    if (code && name && name !== code) return `${code} — ${name}`
    return code ?? name ?? '—'
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex justify-between gap-3 text-sm">
        <span className="shrink-0 text-gray-500">{label}</span>
        <span className="text-right font-medium text-gray-800 dark:text-gray-200">
            {value}
        </span>
    </div>
)

const Section = ({
    title,
    children,
}: {
    title: string
    children: ReactNode
}) => (
    <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {title}
        </p>
        {children}
    </div>
)

const dimensionsLabel = (data: MaterialCatalogReference) => {
    const { length, width, height, dimensionUom } = data.physical
    if (length == null && width == null && height == null) return '—'
    const l = length ?? 0
    const w = width ?? 0
    const h = height ?? 0
    return `${fmtNum(l, 4)}×${fmtNum(w, 4)}×${fmtNum(h, 4)} ${dimensionUom ?? ''}`.trim()
}

type Props = {
    data: MaterialCatalogReference
    compact?: boolean
}

const MaterialCatalogReferenceDetails = ({ data, compact }: Props) => (
    <div
        className={
            compact
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
        }
    >
        <Section title="General">
            <Row label="Code" value={data.general.materialCode} />
            <Row label="Name" value={data.general.materialName} />
            <Row label="MM SKU" value={data.general.sku ?? '—'} />
            <Row label="Status" value={data.general.status} />
            <Row label="Type" value={data.general.materialType ?? '—'} />
            <Row label="Category" value={data.general.materialCategory ?? '—'} />
            {data.general.brand ? (
                <Row label="Brand" value={data.general.brand} />
            ) : null}
        </Section>
        <Section title="UOM">
            <Row
                label="Base UOM"
                value={uomLabel(data.uom.baseUomCode, data.uom.baseUomName)}
            />
            <Row
                label="Sales UOM"
                value={uomLabel(data.uom.salesUomCode, data.uom.salesUomName)}
            />
            <Row
                label="Purchase UOM"
                value={uomLabel(data.uom.purchaseUomCode, data.uom.purchaseUomName)}
            />
        </Section>
        <Section title="Physical">
            <Row
                label="Weight"
                value={
                    data.physical.weight != null
                        ? `${fmtNum(data.physical.weight, 4)} ${data.physical.weightUom ?? ''}`.trim()
                        : '—'
                }
            />
            <Row label="Dimensions (L×W×H)" value={dimensionsLabel(data)} />
            <Row
                label="Volume"
                value={
                    data.physical.volume != null
                        ? `${fmtNum(data.physical.volume, 4)} ${data.physical.volumeUom ?? ''}`.trim()
                        : '—'
                }
            />
        </Section>
        <Section title="Expiry & tracking">
            <Row
                label="Expiry managed"
                value={data.tracking.expiryManaged ? 'Yes' : 'No'}
            />
            <Row
                label="Default shelf life"
                value={
                    data.expiry.defaultShelfLifeDays != null
                        ? `${data.expiry.defaultShelfLifeDays} days`
                        : '—'
                }
            />
            <Row label="Earliest expiry (stock)" value={fmtDate(data.expiry.earliestExpiryDate)} />
            {data.expiry.nearestBatchNumber ? (
                <Row label="Batch (FEFO hint)" value={data.expiry.nearestBatchNumber} />
            ) : null}
            <Row
                label="Batch / serial"
                value={
                    [
                        data.tracking.batchManaged ? 'Batch' : null,
                        data.tracking.serialManaged ? 'Serial' : null,
                    ]
                        .filter(Boolean)
                        .join(', ') || 'None'
                }
            />
            <Row
                label="Sellable"
                value={data.tracking.sellable ? 'Yes' : 'No'}
            />
        </Section>
        <Section title="Inventory (company)">
            <Row label="Available" value={fmtNum(data.inventory.availableQty)} />
            <Row label="On hand" value={fmtNum(data.inventory.onHandQty)} />
            <Row label="Reserved" value={fmtNum(data.inventory.reservedQty)} />
            <Row label="Min stock" value={fmtNum(data.inventory.minimumStock)} />
            <Row label="Max stock" value={fmtNum(data.inventory.maximumStock)} />
            <Row label="Safety stock" value={fmtNum(data.inventory.safetyStock)} />
            <Row label="Reorder point" value={fmtNum(data.inventory.reorderPoint)} />
        </Section>
        <Section title="Valuation">
            <Row
                label="Standard cost"
                value={fmtMoney(data.valuation.standardCost, data.valuation.currencyCode)}
            />
            <Row label="Method" value={data.valuation.valuationMethod ?? '—'} />
            <Row label="Class" value={data.valuation.valuationClass ?? '—'} />
        </Section>
        {data.general.shortDescription || data.general.description ? (
            <div className="sm:col-span-2 lg:col-span-3">
                <Section title="Description">
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                        {data.general.description ?? data.general.shortDescription}
                    </p>
                </Section>
            </div>
        ) : null}
    </div>
)

export default MaterialCatalogReferenceDetails
