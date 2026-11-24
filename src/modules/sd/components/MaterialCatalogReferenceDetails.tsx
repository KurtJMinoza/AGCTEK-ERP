'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { MaterialCatalogReference } from '../services/materialCatalogReferenceService'
import { MM_MATERIALS_SKUS_PATH } from '@/utils/erp-path'

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

type Props = {
    data: MaterialCatalogReference
}

/** Key Material Master facts for the catalog; full record lives in MM ("Open in MM"). */
const MaterialCatalogReferenceDetails = ({ data }: Props) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Material">
            <Row label="MM SKU" value={data.general.sku ?? '—'} />
            <Row label="Status" value={data.general.status} />
            <Row
                label="Category"
                value={data.general.materialCategory ?? '—'}
            />
            <Row
                label="Sellable"
                value={data.tracking.sellable ? 'Yes' : 'No'}
            />
        </Section>
        <Section title="Stock & cost">
            <Row
                label="Available"
                value={fmtNum(data.inventory.availableQty)}
            />
            <Row label="On hand" value={fmtNum(data.inventory.onHandQty)} />
            <Row label="Reserved" value={fmtNum(data.inventory.reservedQty)} />
            <Row
                label="Standard cost"
                value={fmtMoney(
                    data.valuation.standardCost,
                    data.valuation.currencyCode,
                )}
            />
        </Section>
        <Section title="Tax information">
            <Row
                label="Product"
                value={data.general.materialName}
            />
            <Row label="MM SKU" value={data.general.sku ?? '—'} />
            <Row
                label="Tax classification"
                value={data.tax.classificationLabel ?? 'Not configured'}
            />
            <Row
                label="Tax code"
                value={
                    data.tax.taxCode
                        ? `${data.tax.taxCode} — ${data.tax.taxCodeName ?? ''}`
                        : '—'
                }
            />
            <Row
                label="Tax rate"
                value={
                    data.tax.taxRate == null
                        ? 'No active rate'
                        : `${data.tax.taxRate}%`
                }
            />
            <Row
                label="Price tax treatment"
                value={data.tax.priceTaxTreatmentLabel ?? '—'}
            />
            <Row label="Tax status" value={data.tax.status ?? '—'} />
            {!data.tax.readyForSale ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                    {data.tax.effectiveStatus === 'NOT_CONFIGURED'
                        ? 'Tax Classification Not Configured'
                        : `Tax configuration is ${data.tax.effectiveStatus}`}
                </p>
            ) : null}
            <p className="text-xs text-gray-500">
                Tax information is managed by MM Material Master.{' '}
                <Link
                    href={`${MM_MATERIALS_SKUS_PATH}/${encodeURIComponent(data.materialId)}`}
                    className="font-medium text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View Material Master
                </Link>
            </p>
        </Section>
        {data.tracking.batchManaged && data.tracking.batches.length > 0 ? (
            <Section title="Batch / lot (MM)">
                <ul className="space-y-1 text-xs">
                    {data.tracking.batches.slice(0, 6).map((batch) => (
                        <li
                            key={batch.id}
                            className="flex flex-wrap justify-between gap-2 rounded border border-gray-200 px-2 py-1 dark:border-gray-700"
                        >
                            <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
                                {batch.batchNumber}
                                {batch.lotNumber ? ` · Lot ${batch.lotNumber}` : ''}
                            </span>
                            <span className="text-gray-500">{batch.status}</span>
                        </li>
                    ))}
                </ul>
                {data.expiry.nearestBatchNumber ? (
                    <p className="mt-2 text-[11px] text-gray-500">
                        Nearest stocked batch: {data.expiry.nearestBatchNumber}
                        {data.expiry.nearestLotNumber
                            ? ` (lot ${data.expiry.nearestLotNumber})`
                            : ''}
                    </p>
                ) : null}
            </Section>
        ) : null}
    </div>
)

export default MaterialCatalogReferenceDetails
