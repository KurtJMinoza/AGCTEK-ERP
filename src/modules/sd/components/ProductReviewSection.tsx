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
    const { ensure, companies } = useLazyMmRefs()

    const rawCompanyId = useWatch({ control, name: 'companyId' })
    // The form field holds the option VALUE (a string). Guard anyway so an
    // object can never reach React's child rendering.
    const companyId =
        typeof rawCompanyId === 'string' ? rawCompanyId : ''
    const materialId = useWatch({
        control,
        name: 'materialId',
    }) as string | undefined
    const price = useWatch({ control, name: 'price' }) as number

    useEffect(() => {
        void ensure('companies')
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

    /**
     * One material per variant — the Product Catalog LINKS existing
     * materials, it never creates them.
     */
    const materialsToLink = useMemo(
        () =>
            productConfig === 'SIMPLE'
                ? materialId
                    ? 1
                    : 0
                : variants.filter((variant) => !!variant.materialId).length,
        [variants, productConfig, materialId],
    )
    const missingMaterials = useMemo(
        () =>
            productConfig === 'SIMPLE'
                ? materialId
                    ? 0
                    : 1
                : variants.filter((variant) => !variant.materialId).length,
        [variants, productConfig, materialId],
    )

    const companyLabel =
        companies.find((company) => company.value === companyId)?.label ??
        companyId ??
        '—'

    const rows = [
        { label: 'Parent product', value: productName || '—' },
        ...(productSku ? [{ label: 'Product code', value: productSku }] : []),
        {
            label: 'Product configuration',
            value:
                productConfig === 'SIMPLE'
                    ? 'Simple product'
                    : 'Product with variants',
        },
        { label: 'Variants', value: String(variantCount) },
        { label: 'Existing materials to link', value: String(materialsToLink) },
        ...(missingMaterials > 0
            ? [
                  {
                      label: 'Variants without a material',
                      value: String(missingMaterials),
                  },
              ]
            : []),
        { label: 'Company', value: companyLabel },
    ]

    return (
        <div className="md:col-span-2 space-y-4">
            <div>
                <p className="text-sm font-semibold text-gray-900">
                    Review and create
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    The parent product, its variants and their links to
                    existing Material Master items are created in one server
                    transaction. The Product Catalog never creates a material,
                    a Stock Keeping Unit or stock.
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
                                <th className="py-2">Material link</th>
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
                                                    : 'text-xs font-medium text-amber-600'
                                            }
                                        >
                                            {variant.materialId
                                                ? 'Existing material linked'
                                                : 'No material selected'}
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
