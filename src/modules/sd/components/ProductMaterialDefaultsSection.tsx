'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Control } from 'react-hook-form'
import { Controller, useWatch } from 'react-hook-form'
import NumericInput from '@/components/shared/NumericInput'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { useLazyMmRefs, useLazyBinsForWarehouse } from '@/modules/mm/shared/useLazyMmRefs'
import {
    materialCategoryService,
    materialTypeService,
} from '@/modules/mm/material-master/services/referenceService'

type Props = {
    // The wizard form is validated by zod; the control type is intentionally
    // loose so the nested `materialDefaults.*` paths can be addressed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    control: Control<any>
    disabled?: boolean
}

/**
 * Material defaults applied to every Material Master generated for this
 * product's variants (the "Configure material defaults" step of the Product
 * Catalog wizard). Individual variants may override these values.
 *
 * The generated materials start at zero stock — this panel never writes
 * stock; it only defines the master-data defaults.
 */
const ProductMaterialDefaultsSection = ({ control, disabled }: Props) => {
    const { ensure, companies, uoms, warehouses } = useLazyMmRefs()
    const { loadForWarehouse, rows: bins, loading: binsLoading } =
        useLazyBinsForWarehouse()

    const [materialTypes, setMaterialTypes] = useState<
        Array<{ id: string; name: string; code: string }>
    >([])
    const [materialCategories, setMaterialCategories] = useState<
        Array<{ id: string; name: string; code: string }>
    >([])

    const defaultWarehouseId = useWatch({
        control,
        name: 'materialDefaults.defaultWarehouseId',
    }) as string | undefined

    useEffect(() => {
        void ensure('companies', 'uoms', 'warehouses')
    }, [ensure])

    useEffect(() => {
        let cancelled = false
        void Promise.all([
            materialTypeService.list(),
            materialCategoryService.list(),
        ])
            .then(([types, categories]) => {
                if (cancelled) return
                setMaterialTypes(
                    (types ?? []).map((t) => ({
                        id: t.id,
                        name: t.name,
                        code: t.code,
                    })),
                )
                setMaterialCategories(
                    (categories ?? []).map((c) => ({
                        id: c.id,
                        name: c.name,
                        code: c.code,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) {
                    setMaterialTypes([])
                    setMaterialCategories([])
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    // Bins depend on the chosen warehouse.
    useEffect(() => {
        void loadForWarehouse(defaultWarehouseId ?? '')
    }, [defaultWarehouseId, loadForWarehouse])

    const binOptions = useMemo(
        () =>
            bins.map((bin) => ({
                value: bin.id,
                label: bin.code,
            })),
        [bins],
    )

    return (
        <div className="md:col-span-2 space-y-4">
            <div>
                <p className="text-sm font-semibold text-gray-900">
                    Material defaults
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    These defaults are applied to the Material Master created
                    for each variant. Materials start at zero stock — add stock
                    through a goods receipt, opening inventory or an adjustment
                    in Materials Management.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem
                    label="Company"
                    asterisk
                    extra={
                        <span className="text-xs text-gray-500">
                            Owns the generated materials and their stock
                        </span>
                    }
                >
                    <Controller
                        name="companyId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) => field.onChange(value)}
                                isDisabled={disabled}
                                placeholder="Select company"
                                options={companies.map((company) => ({
                                    value: company.value,
                                    label: company.label,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Material type" asterisk>
                    <Controller
                        name="materialDefaults.materialTypeId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) => field.onChange(value)}
                                isDisabled={disabled}
                                placeholder="Select material type"
                                options={materialTypes.map((t) => ({
                                    value: t.id,
                                    label: t.code
                                        ? `${t.code} — ${t.name}`
                                        : t.name,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Material category" asterisk>
                    <Controller
                        name="materialDefaults.materialCategoryId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) => field.onChange(value)}
                                isDisabled={disabled}
                                placeholder="Select material category"
                                options={materialCategories.map((c) => ({
                                    value: c.id,
                                    label: c.code
                                        ? `${c.code} — ${c.name}`
                                        : c.name,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Base unit of measure" asterisk>
                    <Controller
                        name="materialDefaults.baseUomId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) => field.onChange(value)}
                                isDisabled={disabled}
                                placeholder="Select base UoM"
                                options={uoms.map((u) => ({
                                    value: u.value,
                                    label: u.label,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem
                    label="Sales unit of measure"
                    extra={
                        <span className="text-xs text-gray-500">
                            Falls back to the base UoM
                        </span>
                    }
                >
                    <Controller
                        name="materialDefaults.salesUomId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) =>
                                    field.onChange(
                                        value === '' ? undefined : value,
                                    )
                                }
                                isDisabled={disabled}
                                placeholder="Same as base UoM"
                                options={uoms.map((u) => ({
                                    value: u.value,
                                    label: u.label,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Standard cost">
                    <Controller
                        name="materialDefaults.standardCost"
                        control={control}
                        render={({ field }) => (
                            <NumericInput
                                value={field.value ?? 0}
                                onChange={(value) => field.onChange(value ?? 0)}
                                disabled={disabled}
                                min={0}
                                placeholder="0.00"
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Default warehouse">
                    <Controller
                        name="materialDefaults.defaultWarehouseId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) =>
                                    field.onChange(
                                        value === '' ? undefined : value,
                                    )
                                }
                                isDisabled={disabled}
                                placeholder="No default warehouse"
                                options={warehouses.map((w) => ({
                                    value: w.value,
                                    label: w.label,
                                }))}
                            />
                        )}
                    />
                </FormItem>

                <FormItem
                    label="Default storage bin"
                    extra={
                        <span className="text-xs text-gray-500">
                            {binsLoading
                                ? 'Loading bins…'
                                : 'Pick a default warehouse first'}
                        </span>
                    }
                >
                    <Controller
                        name="materialDefaults.storageBinId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value ?? ''}
                                onChange={(value) =>
                                    field.onChange(
                                        value === '' ? undefined : value,
                                    )
                                }
                                isDisabled={disabled || !defaultWarehouseId}
                                placeholder="No default bin"
                                options={binOptions}
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Safety stock">
                    <Controller
                        name="materialDefaults.safetyStock"
                        control={control}
                        render={({ field }) => (
                            <NumericInput
                                value={field.value ?? 0}
                                onChange={(value) => field.onChange(value ?? 0)}
                                disabled={disabled}
                                min={0}
                                placeholder="0"
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Maximum stock">
                    <Controller
                        name="materialDefaults.maximumStock"
                        control={control}
                        render={({ field }) => (
                            <NumericInput
                                value={field.value ?? 0}
                                onChange={(value) => field.onChange(value ?? 0)}
                                disabled={disabled}
                                min={0}
                                placeholder="0"
                            />
                        )}
                    />
                </FormItem>

                <FormItem label="Reorder point">
                    <Controller
                        name="materialDefaults.reorderPoint"
                        control={control}
                        render={({ field }) => (
                            <NumericInput
                                value={field.value ?? 0}
                                onChange={(value) => field.onChange(value ?? 0)}
                                disabled={disabled}
                                min={0}
                                placeholder="0"
                            />
                        )}
                    />
                </FormItem>
            </div>

            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-3">
                <FormItem label="Batch tracking">
                    <Controller
                        name="materialDefaults.batchManaged"
                        control={control}
                        render={({ field }) => (
                            <div className="flex h-12 items-center gap-3">
                                <Switcher
                                    checked={!!field.value}
                                    onChange={(checked) =>
                                        field.onChange(checked)
                                    }
                                    disabled={disabled}
                                />
                                <span className="text-sm text-gray-600">
                                    {field.value ? 'Tracked' : 'Not tracked'}
                                </span>
                            </div>
                        )}
                    />
                </FormItem>

                <FormItem label="Serial-number tracking">
                    <Controller
                        name="materialDefaults.serialManaged"
                        control={control}
                        render={({ field }) => (
                            <div className="flex h-12 items-center gap-3">
                                <Switcher
                                    checked={!!field.value}
                                    onChange={(checked) =>
                                        field.onChange(checked)
                                    }
                                    disabled={disabled}
                                />
                                <span className="text-sm text-gray-600">
                                    {field.value ? 'Tracked' : 'Not tracked'}
                                </span>
                            </div>
                        )}
                    />
                </FormItem>

                <FormItem label="Expiry tracking">
                    <Controller
                        name="materialDefaults.expiryManaged"
                        control={control}
                        render={({ field }) => (
                            <div className="flex h-12 items-center gap-3">
                                <Switcher
                                    checked={!!field.value}
                                    onChange={(checked) =>
                                        field.onChange(checked)
                                    }
                                    disabled={disabled}
                                />
                                <span className="text-sm text-gray-600">
                                    {field.value ? 'Tracked' : 'Not tracked'}
                                </span>
                            </div>
                        )}
                    />
                </FormItem>
            </div>
        </div>
    )
}

export default ProductMaterialDefaultsSection
