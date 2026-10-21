'use client'

import { useEffect, useMemo } from 'react'
import type { Control } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import type { OptionsVariantsDraft } from '../services/productOptionVariantsService'

type Props = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: Control<any>
    optionsDraft: OptionsVariantsDraft | null
    productName: string
    productSku?: string
    /** Simple products get one hidden default variant. */
    productConfig: 'SIMPLE' | 'VARIABLE'
}

const money = (value: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 2,
    }).format(value)

/**
 * Review step of the Product Catalog wizard — the last step before the single
 * transactional create. Shows exactly what will be created:
 * one parent product, its variants, and one Material Master per variant.
 */
const ProductReviewSection = ({
    control,
    optionsDraft,
    productName,
    productSku,
    productConfig,
}: Props) => {
    const { ensure, companies, warehouses } = useLazyMmRefs()

    const companyId = useWatch({ control, name: 'companyId' }) as string
    const defaultWarehouseId = useWatch({
        control,
        name: 'materialDefaults.defaultWarehouseId',
    }) as string | undefined
    const price = useWatch({ control, name: 'price' }) as number

    useEffect(() => {
        void ensure('companies', 'warehouses')
    }, [ensure])

    const variants = useMemo(
        () =>
            (optionsDraft?.variants ?? []).filter(
                (variant) => variant.isActive !== false,
            ),
        [optionsDraft],
    )

    /** Simple products get one hidden default variant. */
    const variantCount =
        productConfig === 'SIMPLE' ? 1 : variants.length

    /** One material per variant, unless the variant links an existing one. */
    const materialsToCreate = useMemo(
        () =>
            productConfig === 'SIMPLE'
                ? 1
                : variants.filter((variant) => !variant.materialId).length,
        [variants, productConfig],
    )
    const materialsToLink = useMemo(
        () =>
            productConfig === 'SIMPLE'
                ? 0
                : variants.filter((variant) => !!variant.materialId).length,
        [variants, productConfig],
    )

    const companyLabel =
        companies.find((company) => company.value === companyId)?.label ??
        companyId ??
        '—'
    const warehouseLabel = defaultWarehouseId
        ? (warehouses.find((w) => w.value === defaultWarehouseId)?.label ??
          defaultWarehouseId)
        : '—'

    const rows = [
        { label: 'Parent product', value: productName || '—' },
        ...(productSku ? [{ label: 'Product code', value: productSku }] : []),
        { label: 'Product configuration', value: productConfig === 'SIMPLE' ? 'Simple product' : 'Product with variants' },
        { label: 'Variants', value: String(variantCount) },
        { label: 'Materials to create', value: String(materialsToCreate) },
        ...(materialsToLink > 0
            ? [{ label: 'Existing materials to link', value: String(materialsToLink) }]
            : []),
        { label: 'Company', value: companyLabel },
        { label: 'Default warehouse', value: warehouseLabel },
    ]

    return (
        <div className="md:col-span-2 space-y-4">
            <div>
                <p className="text-sm font-semibold text-gray-900">
                    Review and create
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    The parent product, its variants and the Material Masters
                    are created in one server transaction. If any material
                    fails, the whole operation is rolled back.
                </p>
            </div>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 dark:border-gray-700">
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-3"
                    >
                        <dt className="text-xs text-gray-500">{row.label}</dt>
                        <dd className="text-sm font-semibold text-gray-900">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>

            {productConfig === 'VARIABLE' && variants.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="py-2 pr-3">Variant</th>
                                <th className="py-2 pr-3">SKU</th>
                                <th className="py-2 pr-3">Barcode</th>
                                <th className="py-2 pr-3 text-right">Price</th>
                                <th className="py-2">Material action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {variants.map((variant) => (
                                <tr
                                    key={
                                        variant.sku ||
                                        variant.variantName ||
                                        'variant'
                                    }
                                    className="border-t border-gray-100 dark:border-gray-800"
                                >
                                    <td className="py-2 pr-3 font-medium text-gray-900">
                                        {variant.variantName}
                                    </td>
                                    <td className="py-2 pr-3 text-gray-600">
                                        {variant.sku || '—'}
                                    </td>
                                    <td className="py-2 pr-3 text-gray-600">
                                        {variant.barcode || '—'}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-gray-900">
                                        {money(variant.price ?? price ?? 0)}
                                    </td>
                                    <td className="py-2">
                                        <span
                                            className={
                                                variant.materialId
                                                    ? 'text-xs font-medium text-blue-600'
                                                    : 'text-xs font-medium text-emerald-600'
                                            }
                                        >
                                            {variant.materialId
                                                ? 'Link existing material'
                                                : 'Create material'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    )
}

export default ProductReviewSection
