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
    </div>
)

export default MaterialCatalogReferenceDetails
