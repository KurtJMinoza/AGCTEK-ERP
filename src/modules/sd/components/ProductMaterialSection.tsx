'use client'

import { useEffect, useMemo } from 'react'
import type { Control } from 'react-hook-form'
import { Controller, useWatch } from 'react-hook-form'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import ProductMaterialPicker from './ProductMaterialPicker'

type Props = {
    // The wizard form is validated by zod; the control type is intentionally
    // loose so the nested paths can be addressed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: Control<any>
    disabled?: boolean
    /** SIMPLE products link one material; VARIABLE products link one per variant. */
    productConfig: 'SIMPLE' | 'VARIABLE'
}

type CompanyOption = { value: string; label: string }

/**
 * Material step of the Product Catalog wizard.
 *
 * The product links EXISTING Material Master items — the wizard never
 * creates a material, a Stock Keeping Unit or stock. A SIMPLE product links
 * one material (its hidden default variant); a VARIABLE product links one
 * material per variant in the Options & Variants step.
 */
const ProductMaterialSection = ({
    control,
    disabled,
    productConfig,
}: Props) => {
    const { ensure, companies } = useLazyMmRefs()
    const rawCompanyId = useWatch({ control, name: 'companyId' })
    // The form field holds the option VALUE (a string).
    const companyId = typeof rawCompanyId === 'string' ? rawCompanyId : ''
    const rawMaterialId = useWatch({ control, name: 'materialId' })
    const materialId =
        typeof rawMaterialId === 'string' ? rawMaterialId : ''

    useEffect(() => {
        void ensure('companies')
    }, [ensure])

    const companyOptions = useMemo(
        () => companies.map((company) => ({
            value: company.value,
            label: company.label,
        })),
        [companies],
    )

    const isSimple = productConfig === 'SIMPLE'

    const summary = useMemo(
        () => [
            {
                label: 'Company',
                value:
                    companyOptions.find(
                        (option) => option.value === companyId,
                    )?.label ??
                    companyId ??
                    '—',
            },
            {
                label: 'Material',
                value: materialId
                    ? '1 existing material selected'
                    : isSimple
                      ? 'No material selected'
                      : 'One per variant (Options & Variants step)',
            },
        ],
        [companyOptions, companyId, materialId, isSimple],
    )

    return (
        <div className="md:col-span-2 space-y-4">
            <div>
                <p className="text-sm font-semibold text-gray-900">
                    Material Master connection
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    {isSimple
                        ? 'This product links one existing Material Master item. The material is created manually under Materials Management — the Product Catalog only links it.'
                        : 'Each variant links its own existing Material Master item. Pick the materials in the Options & Variants step.'}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem
                    label="Company"
                    asterisk
                    extra={
                        <span className="text-xs text-gray-500">
                            Owns the linked materials and their stock
                        </span>
                    }
                >
                    <Controller
                        name="companyId"
                        control={control}
                        render={({ field }) => (
                            <Select<CompanyOption>
                                // react-select hands back the whole OPTION
                                // object — the form field must store the
                                // option's value, not the object, otherwise
                                // an object leaks into the payload (and into
                                // any component that renders it).
                                value={
                                    companyOptions.find(
                                        (option) =>
                                            option.value === field.value,
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    field.onChange(option?.value ?? '')
                                }
                                isDisabled={disabled}
                                placeholder="Select company"
                                options={companyOptions}
                            />
                        )}
                    />
                </FormItem>
            </div>

            {isSimple ? (
                <Controller
                    name="materialId"
                    control={control}
                    render={({ field }) => (
                        <ProductMaterialPicker
                            companyId={companyId || null}
                            value={field.value ?? null}
                            // `field.onChange` writes the form value — the
                            // `Control` object has no setValue().
                            onChange={(value) =>
                                field.onChange(value ?? '')
                            }
                            disabled={disabled || !companyId}
                            required
                        />
                    )}
                />
            ) : null}

            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 dark:border-gray-700">
                {summary.map((row) => (
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
        </div>
    )
}

export default ProductMaterialSection
