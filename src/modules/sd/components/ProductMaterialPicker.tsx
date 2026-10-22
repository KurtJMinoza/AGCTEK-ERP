'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HiOutlineRefresh, HiOutlineSearch } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import { FormItem } from '@/components/ui/Form'
import { MM_MATERIALS_SKUS_PATH } from '@/utils/erp-path'
import {
    fetchLinkableMaterials,
    type LinkableMaterial,
} from '../services/productCatalogService'

type Props = {
    /** Product the material will back. Optional during creation. */
    productId?: string | null
    /** Company scope — only materials of this company are offered. */
    companyId?: string | null
    value?: string | null
    onChange: (materialId: string | null) => void
    disabled?: boolean
    label?: string
    required?: boolean
}

/**
 * Material Master picker for Product Catalog variants.
 *
 * The selector only offers materials that may back a variant: same company,
 * active, sellable, stocked with a Stock Keeping Unit and not already linked
 * to another active variant. There is NO "Create Material" button here —
 * materials are created manually under Materials Management.
 */
const ProductMaterialPicker = ({
    productId,
    companyId,
    value,
    onChange,
    disabled,
    label = 'Existing Material Master item',
    required,
}: Props) => {
    const [materials, setMaterials] = useState<LinkableMaterial[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const rows = await fetchLinkableMaterials({
                productId: productId ?? undefined,
                companyId: companyId ?? undefined,
                search: search.trim() || undefined,
            })
            setMaterials(rows)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unable to load Materials Management items.',
            )
            setMaterials([])
        } finally {
            setLoading(false)
        }
    }, [productId, companyId, search])

    useEffect(() => {
        void load()
    }, [load])

    const selected = useMemo(
        () => materials.find((m) => m.id === value) ?? null,
        [materials, value],
    )

    return (
        <div className="space-y-2">
            <FormItem
                label={label}
                extra={
                    <span className="text-xs text-gray-500">
                        Only active, sellable materials of this company that are
                        not linked to another variant
                    </span>
                }
            >
                <div className="flex items-center gap-2">
                    <Input
                        size="sm"
                        value={search}
                        placeholder="Search material number, name, SKU or barcode"
                        prefix={
                            <HiOutlineSearch className="text-lg text-gray-400" />
                        }
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={disabled}
                    />
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineRefresh className="text-lg" />}
                        aria-label="Refresh materials"
                        onClick={() => void load()}
                        disabled={disabled || loading}
                    />
                </div>
            </FormItem>

            {loading ? (
                <p className="flex items-center gap-2 text-xs text-gray-500">
                    <Spinner size="sm" /> Loading materials…
                </p>
            ) : null}

            {error ? <p className="text-xs text-red-600">{error}</p> : null}

            {!loading && !error && materials.length === 0 ? (
                <p className="text-xs text-gray-500">
                    No material matches. Create it in Materials Management, then
                    press Refresh.
                </p>
            ) : null}

            {materials.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800">
                            <tr>
                                <th className="w-8 px-2 py-1.5">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th className="px-2 py-1.5">Material</th>
                                <th className="px-2 py-1.5">SKU</th>
                                <th className="px-2 py-1.5">Barcode</th>
                                <th className="px-2 py-1.5">Company</th>
                                <th className="px-2 py-1.5">UoM</th>
                                <th className="px-2 py-1.5 text-right">On hand</th>
                                <th className="px-2 py-1.5 text-right">Reserved</th>
                                <th className="px-2 py-1.5 text-right">Available</th>
                                <th className="px-2 py-1.5">Warehouse</th>
                                <th className="px-2 py-1.5">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((material) => {
                                const isSelected = material.id === value
                                return (
                                    <tr
                                        key={material.id}
                                        onClick={() =>
                                            !disabled &&
                                            onChange(
                                                isSelected ? null : material.id,
                                            )
                                        }
                                        className={`cursor-pointer border-t border-gray-100 dark:border-gray-800 ${
                                            isSelected
                                                ? 'bg-primary-50 dark:bg-primary-500/10'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                        }`}
                                    >                                        <td className="px-2 py-1.5">
                                            <input
                                                type="radio"
                                                name="sd-variant-material"
                                                checked={isSelected}
                                                onChange={() =>
                                                    !disabled &&
                                                    onChange(
                                                        isSelected
                                                            ? null
                                                            : material.id,
                                                    )
                                                }
                                                disabled={disabled}
                                                aria-label={`Select ${material.materialCode}`}
                                                className="h-4 w-4 cursor-pointer accent-primary-500"
                                            />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <span className="font-medium text-gray-900">
                                                {material.materialCode}
                                            </span>
                                            <span className="block text-[11px] text-gray-500">
                                                {material.materialName}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-gray-700">
                                            {material.sku || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-gray-700">
                                            {material.barcode || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                            {material.companyName || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                            {material.uomCode || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-gray-700">
                                            {material.onHandQty}
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-gray-700">
                                            {material.reservedQty}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-semibold text-gray-900">
                                            {material.availableQty}
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                            {material.warehouseName || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                            {material.status}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {selected ? (
                <p className="text-xs font-medium text-gray-700">
                    Selected{' '}
                    <span className="font-semibold text-gray-900">
                        {selected.materialCode} — {selected.materialName}
                    </span>{' '}
                    · SKU {selected.sku || '—'} · {selected.uomCode || '—'} ·{' '}
                    {selected.onHandQty} on hand · {selected.reservedQty} reserved
                    · {selected.availableQty} available
                </p>
            ) : null}

            <p className="text-xs text-gray-500">
                Need a new material?{' '}
                <Link
                    href={MM_MATERIALS_SKUS_PATH}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary-600 hover:underline"
                >
                    Open Material Master to Create Material
                </Link>{' '}
                — then press Refresh.
            </p>

            {required && !value ? (
                <p className="text-xs font-medium text-amber-600">
                    Select the Material Master item this variant sells.
                </p>
            ) : null}
        </div>
    )
}

export default ProductMaterialPicker
