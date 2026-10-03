'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import type { MaterialCatalogReference } from '../services/materialCatalogReferenceService'
import { MM_MATERIALS_SKUS_PATH } from '@/utils/erp-path'
import MaterialCatalogReferenceDetails from './MaterialCatalogReferenceDetails'

const fmtNum = (n: number, digits = 2) =>
    new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    }).format(n)

type Props = {
    data: MaterialCatalogReference | null
    loading?: boolean
    error?: string | null
    materialId?: string
}

const MaterialCatalogReferencePanel = ({
    data,
    loading,
    error,
    materialId,
}: Props) => {
    if (!materialId && !loading) return null

    return (
        <Card className="md:col-span-2 border border-dashed border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        MM material reference
                    </h4>
                    <p className="text-xs text-gray-500">
                        View-only — stock, limits, cost, and UOM from Material Master
                    </p>
                </div>
                {data ? (
                    <Link
                        href={`${MM_MATERIALS_SKUS_PATH}/${data.materialId}`}
                        className="text-xs font-medium text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open in Material Master
                    </Link>
                ) : null}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                    <Spinner />
                    Loading material data…
                </div>
            ) : null}

            {error ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
            ) : null}

            {data && !loading ? (
                <>
                    <div className="mb-4 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-deep">
                            Available (sellable)
                        </p>
                        <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {fmtNum(data.inventory.availableQty)}{' '}
                            <span className="text-base font-medium text-gray-600 dark:text-gray-400">
                                {data.uom.salesUomCode ?? data.uom.baseUomCode ?? 'UOM'}
                            </span>
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            On hand {fmtNum(data.inventory.onHandQty)} · Reserved{' '}
                            {fmtNum(data.inventory.reservedQty)} · Safety stock{' '}
                            {fmtNum(data.inventory.safetyStock)} (planning buffer, not
                            sellable)
                            {data.inventory.fulfillmentAtpQty != null
                                ? ` · Warehouse ATP ${fmtNum(data.inventory.fulfillmentAtpQty)}`
                                : ''}
                        </p>
                    </div>
                <MaterialCatalogReferenceDetails data={data} />
                </>
            ) : null}
        </Card>
    )
}

export default MaterialCatalogReferencePanel
