'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Control } from 'react-hook-form'
import { Controller, useWatch } from 'react-hook-form'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import Spinner from '@/components/ui/Spinner'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { MM_MATERIALS_SKUS_PATH } from '@/utils/erp-path'
import {
    fetchMaterialCatalogReferenceBatch,
    type MaterialCatalogReference,
    type MaterialCatalogReferenceBatch,
} from '../services/materialCatalogReferenceService'
import MaterialCatalogReferenceDetails from './MaterialCatalogReferenceDetails'
import MmInventoryCompanyMetrics from './MmInventoryCompanyMetrics'

type Option = { value: string; label: string }

type Props = {
    control: Control<any>
    editing: boolean
    divisionId: string
    productDivisionId?: string
    /** Edit mode: linked materials from assignments */
    initialMaterialIds?: string[]
    initialCompanyId?: string | null
    /** Bump to refetch MM stock after material threshold edits */
    mmStockRefreshKey?: number
    /** Called with the linked materials (primary first) each time MM data loads. */
    onMaterialsLoaded?: (materials: MaterialCatalogReference[]) => void
}

const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(n)

const salesUom = (row: MaterialCatalogReference) =>
    row.uom.salesUomCode ?? row.uom.baseUomCode ?? '—'

const dimensions = (row: MaterialCatalogReference) => {
    const { length, width, height, dimensionUom } = row.physical
    if (length == null && width == null && height == null) return '—'
    return `${length ?? 0}×${width ?? 0}×${height ?? 0} ${dimensionUom ?? ''}`.trim()
}

const expirySummary = (row: MaterialCatalogReference) => {
    if (!row.tracking.expiryManaged) return 'Not managed'
    if (row.expiry.earliestExpiryDate) {
        return new Date(row.expiry.earliestExpiryDate).toLocaleDateString()
    }
    if (row.expiry.defaultShelfLifeDays != null) {
        return `${row.expiry.defaultShelfLifeDays}d shelf life`
    }
    return 'Managed'
}

const ProductCatalogMaterialSection = ({
    control,
    editing,
    divisionId,
    productDivisionId,
    initialMaterialIds,
    initialCompanyId,
    mmStockRefreshKey = 0,
    onMaterialsLoaded,
}: Props) => {
    const onMaterialsLoadedRef = useRef(onMaterialsLoaded)
    onMaterialsLoadedRef.current = onMaterialsLoaded
    const {
        ensure: ensureMmRefs,
        companies,
        materials,
        loading: mmRefsLoading,
    } = useLazyMmRefs()
    const materialLinkMode = useWatch({ control, name: 'materialLinkMode' })
    const companyId = useWatch({ control, name: 'companyId' })
    const materialIds = useWatch({ control, name: 'materialIds' }) as string[]

    const [batch, setBatch] = useState<MaterialCatalogReferenceBatch | null>(
        null,
    )
    const [batchLoading, setBatchLoading] = useState(false)
    const [batchError, setBatchError] = useState<string | null>(null)

    useEffect(() => {
        void ensureMmRefs('companies', 'materials')
    }, [ensureMmRefs])

    const effectiveDivision = divisionId || productDivisionId || ''
    const ids = useMemo(() => {
        const fromForm = Array.isArray(materialIds)
            ? materialIds.filter(Boolean)
            : []
        if (fromForm.length) return fromForm
        if (editing && initialMaterialIds?.length) {
            return initialMaterialIds.filter(Boolean)
        }
        return []
    }, [materialIds, editing, initialMaterialIds])
    const effectiveCompany = companyId?.trim() || initialCompanyId?.trim() || ''

    useEffect(() => {
        if (!effectiveCompany || !ids.length) {
            setBatch(null)
            setBatchError(null)
            return
        }
        let cancelled = false
        setBatchLoading(true)
        setBatchError(null)
        void fetchMaterialCatalogReferenceBatch(
            ids,
            effectiveCompany,
            effectiveDivision,
            mmStockRefreshKey > 0 ? mmStockRefreshKey : undefined,
        )
            .then((data) => {
                if (cancelled) return
                setBatch(data)
                onMaterialsLoadedRef.current?.(data.materials)
            })
            .catch((err) => {
                if (!cancelled) {
                    setBatch(null)
                    setBatchError(
                        err instanceof Error
                            ? err.message
                            : 'Could not load MM stock',
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setBatchLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [ids.join(','), effectiveCompany, effectiveDivision, mmStockRefreshKey])

    useEffect(() => {
        if (editing && initialMaterialIds?.length && !ids.length) {
            // Populated by parent reset
        }
    }, [editing, initialMaterialIds, ids.length])

    const materialOptions = materials
    const multi = materialLinkMode === 'multiple'

    return (
        <>
            {!editing ? (
                <FormItem label="MM link mode" className="md:col-span-2">
                    <Controller
                        name="materialLinkMode"
                        control={control}
                        render={({ field }) => (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        field.value === 'single'
                                            ? 'solid'
                                            : 'default'
                                    }
                                    onClick={() => field.onChange('single')}
                                >
                                    One material
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        field.value === 'multiple'
                                            ? 'solid'
                                            : 'default'
                                    }
                                    onClick={() => field.onChange('multiple')}
                                >
                                    Multiple materials
                                </Button>
                                <span className="self-center text-xs text-gray-500">
                                    {field.value === 'single'
                                        ? 'Single SKU in Materials Management'
                                        : 'Kit / bundle — first material is primary for storefront ATP'}
                                </span>
                            </div>
                        )}
                    />
                </FormItem>
            ) : null}

            <FormItem label="Company (MM scope)" asterisk invalid={false}>
                <Controller
                    name="companyId"
                    control={control}
                    render={({ field }) => (
                        <Select<Option>
                            isSearchable
                            isLoading={mmRefsLoading}
                            isDisabled={editing}
                            placeholder="Select company"
                            options={companies}
                            value={
                                companies.find(
                                    (o) => o.value === field.value,
                                ) ?? null
                            }
                            onChange={(option) =>
                                field.onChange(option?.value ?? '')
                            }
                        />
                    )}
                />
            </FormItem>

            <FormItem
                label={multi ? 'MM materials' : 'MM material'}
                asterisk
                className={multi ? 'md:col-span-2' : undefined}
            >
                <Controller
                    name="materialIds"
                    control={control}
                    render={({ field }) => (
                        <Select
                            isMulti={multi}
                            isSearchable
                            isLoading={mmRefsLoading}
                            isDisabled={editing}
                            placeholder={
                                multi
                                    ? 'Select one or more materials'
                                    : 'Select material'
                            }
                            options={materialOptions}
                            value={
                                multi
                                    ? materialOptions.filter((o) =>
                                          (field.value as string[]).includes(
                                              o.value,
                                          ),
                                      )
                                    : (materialOptions.find(
                                          (o) =>
                                              o.value ===
                                              (field.value as string[])?.[0],
                                      ) ?? null)
                            }
                            onChange={(option) => {
                                if (multi) {
                                    const list = Array.isArray(option)
                                        ? option
                                        : []
                                    field.onChange(list.map((o) => o.value))
                                } else {
                                    const one =
                                        (option as Option | null) ?? null
                                    field.onChange(one ? [one.value] : [])
                                }
                            }}
                        />
                    )}
                />
                <p className="mt-1 text-xs text-gray-500">
                    Inventory below matches{' '}
                    <Link
                        href={MM_MATERIALS_SKUS_PATH}
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Materials Management
                    </Link>{' '}
                    (company scope).
                </p>
            </FormItem>

            {ids.length && effectiveCompany ? (
                <div className="md:col-span-2">
                    {batchError ? (
                        <p className="text-sm text-red-600">{batchError}</p>
                    ) : (
                        <MmInventoryCompanyMetrics
                            loading={batchLoading}
                            available={
                                batch?.materials.length === 1
                                    ? (batch.materials[0].inventory
                                          .availableQty ?? 0)
                                    : (batch?.totals.stockAvailable ?? 0)
                            }
                            onHand={
                                batch?.materials.length === 1
                                    ? (batch.materials[0].inventory.onHandQty ??
                                      0)
                                    : (batch?.totals.onHandQty ?? 0)
                            }
                            maxStock={
                                batch?.materials.length === 1
                                    ? (batch.materials[0].inventory
                                          .maximumStock ?? 0)
                                    : (batch?.totals.maximumStock ?? 0)
                            }
                            safetyStock={
                                batch?.materials.length === 1
                                    ? (batch.materials[0].inventory
                                          .safetyStock ?? 0)
                                    : (batch?.totals.safetyStock ?? 0)
                            }
                        />
                    )}
                </div>
            ) : null}

            {ids.length && effectiveCompany ? (
                <div className="md:col-span-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    {batchLoading ? (
                        <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
                            <Spinner size={20} />
                            Loading inventory from MM…
                        </div>
                    ) : batch ? (
                        <table className="w-full min-w-[960px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900">
                                <tr>
                                    <th className="px-3 py-2">Material</th>
                                    <th className="px-3 py-2">Sales UOM</th>
                                    <th className="px-3 py-2">
                                        Dimensions (L×W×H)
                                    </th>
                                    <th className="px-3 py-2">Expiry</th>
                                    <th className="px-3 py-2 text-right">
                                        On hand
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Available (sellable)
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Max stock
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Safety stock
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {batch.materials.map(
                                    (row: MaterialCatalogReference) => (
                                        <tr
                                            key={row.materialId}
                                            className="border-t border-gray-100 dark:border-gray-800"
                                        >
                                            <td className="px-3 py-2">
                                                <Link
                                                    href={`${MM_MATERIALS_SKUS_PATH}/${row.materialId}`}
                                                    className="font-medium text-primary hover:underline"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {row.general.materialCode}
                                                </Link>
                                                <div className="text-xs text-gray-500">
                                                    {row.general.materialName}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {salesUom(row)}
                                                {row.uom.salesUomName &&
                                                row.uom.salesUomName !==
                                                    row.uom.salesUomCode ? (
                                                    <div className="text-gray-500">
                                                        {row.uom.salesUomName}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-2 text-xs tabular-nums">
                                                {dimensions(row)}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {expirySummary(row)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {fmt(row.inventory.onHandQty)}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">
                                                {fmt(
                                                    row.inventory.availableQty,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {fmt(
                                                    row.inventory.maximumStock,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                                                {fmt(row.inventory.safetyStock)}
                                            </td>
                                        </tr>
                                    ),
                                )}
                                {batch.materials.length > 1 ? (
                                    <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-medium dark:border-gray-700 dark:bg-gray-900/50">
                                        <td className="px-3 py-2" colSpan={4}>
                                            Totals (ecommerce uses min
                                            Available)
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {fmt(batch.totals.onHandQty)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {fmt(batch.totals.stockAvailable)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {fmt(batch.totals.maximumStock)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {fmt(batch.totals.safetyStock)}
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    ) : null}
                </div>
            ) : null}

            {batch && !batchLoading ? (
                <div className="md:col-span-2 space-y-4">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Material Master details
                    </p>
                    {batch.materials.map((row) => (
                        <div
                            key={row.materialId}
                            className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30"
                        >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm font-medium heading-text">
                                        {row.general.materialCode} —{' '}
                                        {row.general.materialName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        Base {row.uom.baseUomCode ?? '—'}
                                        {row.uom.baseUomName
                                            ? ` (${row.uom.baseUomName})`
                                            : ''}
                                        · Sales {salesUom(row)}
                                    </p>
                                </div>
                                <Link
                                    href={`${MM_MATERIALS_SKUS_PATH}/${row.materialId}`}
                                    className="text-xs font-medium text-primary hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Open in MM
                                </Link>
                            </div>
                            <MaterialCatalogReferenceDetails data={row} />
                        </div>
                    ))}
                </div>
            ) : null}
        </>
    )
}

export default ProductCatalogMaterialSection
