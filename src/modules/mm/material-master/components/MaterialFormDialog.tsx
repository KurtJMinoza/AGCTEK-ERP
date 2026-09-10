'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tabs from '@/components/ui/Tabs'
import Tag from '@/components/ui/Tag'
import Segment from '@/components/ui/Segment'
import { Form, FormItem } from '@/components/ui/Form'
import NumericInput from '@/components/shared/NumericInput'
import {
    HiOutlineCube,
    HiOutlineScale,
    HiOutlineShieldCheck,
    HiOutlineTag,
    HiOutlineCurrencyDollar,
    HiOutlineTemplate,
    HiOutlineExclamationCircle,
    HiCheckCircle,
} from 'react-icons/hi'
import { useReferenceData } from '../hooks/useReferenceData'
import { useSupplierOptions } from '@/modules/mm/shared/useEntityOptions'
import UomCodeSelect from '@/modules/mm/shared/UomCodeSelect'
import {
    buildAlternateUomOptions,
    buildGroupedBaseUomOptions,
    getConvertibleUomIds,
} from '@/modules/mm/shared/uomHelpers'
import type { Material, CreateMaterialPayload } from '../types'
import type { ReactNode } from 'react'

const MATERIAL_NAME_MAX = 120

const baseMaterialSchema = z
    .object({
        materialCode: z.string().optional().or(z.literal('')),
        materialName: z
            .string()
            .min(2, 'At least 2 characters')
            .max(MATERIAL_NAME_MAX, `Max ${MATERIAL_NAME_MAX} characters`),
        description: z.string().optional().or(z.literal('')),
        materialTypeId: z.string().min(1, 'Type is required'),
        materialCategoryId: z.string().min(1, 'Category is required'),
        status: z.string().optional(),
        brand: z.string().optional().or(z.literal('')),
        model: z.string().optional().or(z.literal('')),
        manufacturer: z.string().optional().or(z.literal('')),
        baseUomId: z.string().min(1, 'Base UOM is required'),
        purchaseUomId: z.string().optional().or(z.literal('')),
        salesUomId: z.string().optional().or(z.literal('')),
        sku: z.string().optional().or(z.literal('')),
        weight: z.number().min(0).optional(),
        weightUom: z.string().optional().or(z.literal('')),
        length: z.number().min(0).optional(),
        width: z.number().min(0).optional(),
        height: z.number().min(0).optional(),
        dimensionUom: z.string().optional().or(z.literal('')),
        volume: z.number().min(0).optional(),
        volumeUom: z.string().optional().or(z.literal('')),
        batchManaged: z.boolean(),
        serialManaged: z.boolean(),
        qualityInspectionRequired: z.boolean(),
        expiryManaged: z.boolean(),
        inventoryManaged: z.boolean(),
        purchasable: z.boolean(),
        sellable: z.boolean(),
        minimumStock: z.number().min(0),
        maximumStock: z.number().min(0),
        safetyStock: z.number().min(0),
        reorderPoint: z.number().min(0),
        reorderQuantity: z.number().min(0),
        leadTimeDays: z.number().min(0),
        minimumOrderQuantity: z.number().min(0),
        valuationMethod: z.string().optional().or(z.literal('')),
        standardCost: z.number().min(0),
        currencyId: z.string().optional().or(z.literal('')),
        valuationClassId: z.string().optional().or(z.literal('')),
        companyId: z.string().optional().or(z.literal('')),
        defaultWarehouseId: z.string().optional().or(z.literal('')),
        preferredSupplierId: z.string().optional().or(z.literal('')),
    })
    .refine((d) => d.maximumStock === 0 || d.maximumStock >= d.minimumStock, {
        path: ['maximumStock'],
        message: 'Max stock must be >= min stock',
    })
    .refine((d) => d.reorderPoint === 0 || d.safetyStock === 0 || d.reorderPoint >= d.safetyStock, {
        path: ['reorderPoint'],
        message: 'Reorder point should be >= safety stock',
    })

type FormShape = z.infer<typeof baseMaterialSchema>
type SelectOption = { value: string; label: string }

type MaterialFormDialogProps = {
    isOpen: boolean
    mode: 'create' | 'edit'
    material?: Material | null
    existingCodes?: Set<string>
    onClose: () => void
    onSubmit: (values: CreateMaterialPayload) => void
}

const blankValues: FormShape = {
    materialCode: '',
    materialName: '',
    description: '',
    materialTypeId: '',
    materialCategoryId: '',
    status: 'DRAFT',
    brand: '',
    model: '',
    manufacturer: '',
    baseUomId: '',
    purchaseUomId: '',
    salesUomId: '',
    sku: '',
    weight: 0,
    weightUom: 'KG',
    length: 0,
    width: 0,
    height: 0,
    dimensionUom: 'CM',
    volume: 0,
    volumeUom: 'L',
    batchManaged: false,
    serialManaged: false,
    qualityInspectionRequired: false,
    expiryManaged: false,
    inventoryManaged: true,
    purchasable: true,
    sellable: true,
    minimumStock: 0,
    maximumStock: 0,
    safetyStock: 0,
    reorderPoint: 0,
    reorderQuantity: 0,
    leadTimeDays: 0,
    minimumOrderQuantity: 0,
    valuationMethod: '',
    standardCost: 0,
    currencyId: '',
    valuationClassId: '',
    companyId: '',
    defaultWarehouseId: '',
    preferredSupplierId: '',
}

function toFormValues(material?: Material | null): FormShape {
    if (!material) return blankValues
    return {
        materialCode: material.materialCode,
        materialName: material.materialName,
        description: material.description ?? material.shortDescription ?? '',
        materialTypeId: material.materialTypeId,
        materialCategoryId: material.materialCategoryId,
        status: material.status,
        brand: material.brand ?? '',
        model: material.model ?? '',
        manufacturer: material.manufacturer ?? '',
        baseUomId: material.baseUomId,
        purchaseUomId: material.purchaseUomId ?? '',
        salesUomId: material.salesUomId ?? '',
        sku: material.sku ?? '',
        weight: Number(material.weight ?? 0),
        weightUom: material.weightUom ?? '',
        length: Number(material.length ?? 0),
        width: Number(material.width ?? 0),
        height: Number(material.height ?? 0),
        dimensionUom: material.dimensionUom ?? '',
        volume: Number(material.volume ?? 0),
        volumeUom: material.volumeUom ?? '',
        batchManaged: material.batchManaged,
        serialManaged: material.serialManaged,
        qualityInspectionRequired: material.qualityInspectionRequired,
        expiryManaged: material.expiryManaged,
        inventoryManaged: material.inventoryManaged,
        purchasable: material.purchasable,
        sellable: material.sellable,
        minimumStock: Number(material.minimumStock),
        maximumStock: Number(material.maximumStock),
        safetyStock: Number(material.safetyStock),
        reorderPoint: Number(material.reorderPoint),
        reorderQuantity: Number(material.reorderQuantity),
        leadTimeDays: material.leadTimeDays,
        minimumOrderQuantity: Number(material.minimumOrderQuantity),
        valuationMethod: material.valuationMethod ?? '',
        standardCost: Number(material.standardCost),
        currencyId: material.currencyId ?? '',
        valuationClassId: material.valuationClassId ?? '',
        companyId: material.companyId ?? '',
        defaultWarehouseId: material.defaultWarehouseId ?? '',
        preferredSupplierId: material.preferredSupplierId ?? '',
    }
}

type TabDef = { value: string; label: string; icon: ReactNode; fields: (keyof FormShape)[] }

const TABS: TabDef[] = [
    { value: 'general', label: 'General', icon: <HiOutlineTemplate />, fields: ['materialName', 'description', 'materialTypeId', 'materialCategoryId', 'brand', 'model', 'manufacturer', 'status'] },
    { value: 'uom', label: 'UOM', icon: <HiOutlineScale />, fields: ['baseUomId', 'purchaseUomId', 'salesUomId'] },
    { value: 'physical', label: 'Physical', icon: <HiOutlineCube />, fields: ['weight', 'weightUom', 'length', 'width', 'height', 'dimensionUom', 'volume', 'volumeUom', 'sku'] },
    { value: 'tracking', label: 'Tracking', icon: <HiOutlineShieldCheck />, fields: ['batchManaged', 'serialManaged', 'qualityInspectionRequired', 'expiryManaged'] },
    { value: 'inventory', label: 'Inventory', icon: <HiOutlineTag />, fields: ['inventoryManaged', 'purchasable', 'sellable', 'minimumStock', 'maximumStock', 'safetyStock', 'reorderPoint', 'reorderQuantity', 'leadTimeDays', 'minimumOrderQuantity'] },
    { value: 'valuation', label: 'Valuation', icon: <HiOutlineCurrencyDollar />, fields: ['valuationMethod', 'standardCost', 'currencyId', 'valuationClassId', 'companyId', 'defaultWarehouseId', 'preferredSupplierId'] },
]

const FORM_ID = 'material-master-form'

const selectPortal = {
    menuPortalTarget: typeof document !== 'undefined' ? document.body : undefined,
    menuPosition: 'fixed' as const,
    styles: { menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }) },
}

const STATUS_OPTIONS: SelectOption[] = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'BLOCKED', label: 'Blocked' },
]

const VALUATION_METHOD_OPTIONS: SelectOption[] = [
    { value: 'MOVING_AVERAGE', label: 'Moving Average' },
    { value: 'FIFO', label: 'FIFO' },
    { value: 'LIFO', label: 'LIFO' },
    { value: 'STANDARD_COST', label: 'Standard Cost' },
]

type SkuMode = 'auto' | 'custom'

const MaterialFormDialog = ({ isOpen, mode, material, onClose, onSubmit }: MaterialFormDialogProps) => {
    const [tab, setTab] = useState('general')
    const [skuMode, setSkuMode] = useState<SkuMode>('auto')
    const { materialTypes, materialCategories, uoms, uomConversions, valuationClasses, currencies, companies, warehouses } = useReferenceData()
    const { options: supplierOptions } = useSupplierOptions({ enabled: isOpen })

    const typeOptions = useMemo<SelectOption[]>(() => materialTypes.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })), [materialTypes])
    const categoryOptions = useMemo<SelectOption[]>(() => materialCategories.map((c) => ({ value: c.id, label: c.name })), [materialCategories])
    const groupedBaseUomOptions = useMemo(() => buildGroupedBaseUomOptions(uoms), [uoms])
    const flatBaseUomOptions = useMemo(
        () => groupedBaseUomOptions.flatMap((g) => g.options),
        [groupedBaseUomOptions],
    )
    const conversionEdges = useMemo(
        () =>
            uomConversions
                .filter((c) => !c.materialId || (material?.id && c.materialId === material.id))
                .map((c) => ({ fromUomId: c.fromUomId, toUomId: c.toUomId })),
        [uomConversions, material?.id],
    )
    const currencyOptions = useMemo<SelectOption[]>(() => currencies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })), [currencies])
    const valClassOptions = useMemo<SelectOption[]>(() => valuationClasses.map((v) => ({ value: v.id, label: v.name })), [valuationClasses])
    const companyOptions = useMemo<SelectOption[]>(() => companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })), [companies])
    const warehouseOptions = useMemo<SelectOption[]>(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses])

    const initialValues = useMemo(() => toFormValues(material), [material])

    const schema = useMemo(() => baseMaterialSchema, [])

    const { control, handleSubmit, reset, setValue, setError, clearErrors, formState: { errors, isSubmitting, isDirty, isValid, submitCount, touchedFields } } = useForm<FormShape>({
        defaultValues: initialValues,
        resolver: zodResolver(schema),
        mode: 'onChange',
        reValidateMode: 'onChange',
        criteriaMode: 'all',
    })

    const nameValue = useWatch({ control, name: 'materialName' }) ?? ''
    const baseUomId = useWatch({ control, name: 'baseUomId' }) ?? ''
    const purchaseUomId = useWatch({ control, name: 'purchaseUomId' }) ?? ''
    const salesUomId = useWatch({ control, name: 'salesUomId' }) ?? ''

    const alternateUomOptions = useMemo(
        () => buildAlternateUomOptions(uoms, baseUomId, conversionEdges, [purchaseUomId, salesUomId]),
        [uoms, baseUomId, conversionEdges, purchaseUomId, salesUomId],
    )

    const baseUom = uoms.find((u) => u.id === baseUomId)
    const alternateUomHint = useMemo(() => {
        if (!baseUomId) return 'Select a base UOM first.'
        if (alternateUomOptions.length === 0) {
            return `No alternate units convert to ${baseUom?.code ?? 'the base UOM'}. Add rules under Material Master → UOM Conversions, or leave these blank to use the base unit.`
        }
        const codes = alternateUomOptions.map((o) => o.label.split(' — ')[0]).join(', ')
        return `Optional. Leave blank to use ${baseUom?.code ?? 'base UOM'} for buying and selling. Compatible alternates: ${codes}.`
    }, [alternateUomOptions, baseUom, baseUomId])

    const errorCount = useMemo(() => countErrors(errors as Record<string, unknown>), [errors])
    const tabErrorCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const t of TABS) {
            let sum = 0
            for (const f of t.fields) {
                const err = errors[f as keyof typeof errors]
                if (err) sum += countErrors(err as Record<string, unknown>)
            }
            counts[t.value] = sum
        }
        return counts
    }, [errors])

    useEffect(() => {
        if (!baseUomId) return
        const allowed = getConvertibleUomIds(baseUomId, conversionEdges)
        if (purchaseUomId && !allowed.has(purchaseUomId)) {
            setValue('purchaseUomId', '', { shouldDirty: true })
        }
        if (salesUomId && !allowed.has(salesUomId)) {
            setValue('salesUomId', '', { shouldDirty: true })
        }
    }, [baseUomId, conversionEdges, purchaseUomId, salesUomId, setValue])

    useEffect(() => {
        if (isOpen) {
            reset(initialValues)
            setTab('general')
            setSkuMode(mode === 'create' ? 'auto' : material?.sku ? 'custom' : 'auto')
        }
    }, [isOpen, initialValues, reset, mode, material?.sku])

    const handleSkuModeChange = (next: SkuMode) => {
        setSkuMode(next)
        clearErrors('sku')
        if (next === 'auto') {
            setValue('sku', '', { shouldDirty: true })
        }
    }

    const onValid = (values: FormShape) => {
        const customSku = values.sku?.trim() ?? ''
        if (skuMode === 'custom' && !customSku) {
            setError('sku', { type: 'manual', message: 'Enter a SKU or switch to auto-generate' })
            setTab('physical')
            return
        }

        const payload: CreateMaterialPayload = {
            materialName: values.materialName,
            materialTypeId: values.materialTypeId,
            materialCategoryId: values.materialCategoryId,
            baseUomId: values.baseUomId,
            description: values.description?.trim() || undefined,
            shortDescription: mode === 'edit' ? '' : undefined,
            status: values.status || 'DRAFT',
            brand: values.brand || undefined,
            model: values.model || undefined,
            manufacturer: values.manufacturer || undefined,
            sku: skuMode === 'custom' ? customSku : undefined,
            purchaseUomId: values.purchaseUomId || undefined,
            salesUomId: values.salesUomId || undefined,
            weight: values.weight || undefined,
            weightUom: values.weightUom || undefined,
            length: values.length || undefined,
            width: values.width || undefined,
            height: values.height || undefined,
            dimensionUom: values.dimensionUom || undefined,
            volume: values.volume || undefined,
            volumeUom: values.volumeUom || undefined,
            batchManaged: values.batchManaged,
            serialManaged: values.serialManaged,
            qualityInspectionRequired: values.qualityInspectionRequired,
            expiryManaged: values.expiryManaged,
            inventoryManaged: values.inventoryManaged,
            purchasable: values.purchasable,
            sellable: values.sellable,
            minimumStock: values.minimumStock,
            maximumStock: values.maximumStock,
            safetyStock: values.safetyStock,
            reorderPoint: values.reorderPoint,
            reorderQuantity: values.reorderQuantity,
            leadTimeDays: values.leadTimeDays,
            minimumOrderQuantity: values.minimumOrderQuantity,
            valuationMethod: values.valuationMethod || undefined,
            standardCost: values.standardCost,
            currencyId: values.currencyId || undefined,
            valuationClassId: values.valuationClassId || undefined,
            companyId: values.companyId || undefined,
            defaultWarehouseId: values.defaultWarehouseId || undefined,
            preferredSupplierId: values.preferredSupplierId || undefined,
        }
        onSubmit(payload)
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            width={760}
            title={mode === 'create' ? 'New material' : 'Edit material'}
            description={
                mode === 'create'
                    ? 'Register a new material in the Material Master.'
                    : material
                      ? `${material.materialCode} · ${material.materialName}`
                      : ''
            }
            icon={<HiOutlineCube />}
            headerExtra={
                <Tabs value={tab} onChange={(v) => setTab(v)}>
                    <Tabs.TabList className="!overflow-visible">
                        {TABS.map((t) => {
                            const count = tabErrorCounts[t.value] ?? 0
                            return (
                                <Tabs.TabNav key={t.value} value={t.value} icon={t.icon}>
                                    <span className="hidden sm:inline">{t.label}</span>
                                    {count > 0 && <span className="ms-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{count}</span>}
                                </Tabs.TabNav>
                            )
                        })}
                    </Tabs.TabList>
                </Tabs>
            }
            footerClassName="!justify-between"
            footer={
                <>
                    <div className="min-w-0 text-xs">
                        {errorCount > 0 ? (
                            <button type="button" onClick={() => { const first = TABS.find((t) => (tabErrorCounts[t.value] ?? 0) > 0); if (first) setTab(first.value) }} className="inline-flex items-center gap-1.5 font-medium text-red-500 hover:underline">
                                <HiOutlineExclamationCircle className="text-base" />{errorCount} field{errorCount > 1 ? 's' : ''} need attention
                            </button>
                        ) : isDirty ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Unsaved changes</span>
                        ) : isValid && submitCount === 0 ? (
                            <span className="text-gray-500 dark:text-gray-400">Ready to save</span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><HiCheckCircle className="text-base" />All changes saved</span>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" size="sm" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                        <Button size="sm" variant="solid" type="submit" form={FORM_ID} loading={isSubmitting}>
                            {mode === 'create' ? 'Create material' : 'Save changes'}
                        </Button>
                    </div>
                </>
            }
        >
            <Form id={FORM_ID} onSubmit={handleSubmit(onValid)}>
                    <TabPanel active={tab === 'general'}>
                        <SectionHeader title="Identification" />
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Material code">
                                <Input
                                    value={mode === 'edit' && material ? material.materialCode : 'Auto-generated (e.g. MAT-000001)'}
                                    disabled
                                    className="!bg-gray-100 dark:!bg-gray-700/50"
                                />
                                <p className="mt-1 text-xs text-gray-400">Assigned automatically and cannot be changed.</p>
                            </FormItem>
                            <FormItem label="Material name" asterisk invalid={Boolean(errors.materialName)} errorMessage={errors.materialName?.message}>
                                <Controller name="materialName" control={control} render={({ field }) => (
                                    <Input placeholder="e.g. Corrugated Box 400x300x200" maxLength={MATERIAL_NAME_MAX} suffix={<FieldValidIcon show={Boolean(touchedFields.materialName) && nameValue.length >= 2 && !errors.materialName} />} {...field} />
                                )} />
                                <FieldFootnote count={nameValue.length} max={MATERIAL_NAME_MAX} />
                            </FormItem>
                            <FormItem label="Material type" asterisk invalid={Boolean(errors.materialTypeId)} errorMessage={errors.materialTypeId?.message}>
                                <Controller name="materialTypeId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} placeholder="Select type" options={typeOptions} value={typeOptions.find((o) => o.value === field.value)} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Category" asterisk invalid={Boolean(errors.materialCategoryId)} errorMessage={errors.materialCategoryId?.message}>
                                <Controller name="materialCategoryId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} placeholder="Select category" options={categoryOptions} value={categoryOptions.find((o) => o.value === field.value)} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Brand"><Controller name="brand" control={control} render={({ field }) => <Input placeholder="e.g. Dell" {...field} />} /></FormItem>
                            <FormItem label="Model"><Controller name="model" control={control} render={({ field }) => <Input placeholder="e.g. Latitude 7450" {...field} />} /></FormItem>
                            <FormItem label="Manufacturer"><Controller name="manufacturer" control={control} render={({ field }) => <Input placeholder="Manufacturer name" {...field} />} /></FormItem>
                            <FormItem label="Status" asterisk>
                                <Controller name="status" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} placeholder="Status" options={STATUS_OPTIONS} value={STATUS_OPTIONS.find((o) => o.value === field.value)} onChange={(opt) => field.onChange(opt?.value ?? 'DRAFT')} />
                                )} />
                            </FormItem>
                        </div>
                        <FormItem label="Description">
                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <Input textArea rows={3} placeholder="Optional notes about this material" {...field} />
                                )}
                            />
                        </FormItem>
                    </TabPanel>

                    {/* UOM */}
                    <TabPanel active={tab === 'uom'}>
                        <SectionHeader
                            title="Units of measure"
                            description="Base UOM is how inventory is tracked. Purchase and Sales UOM are only needed when you buy or sell in a different unit that converts to the base (e.g. buy Cartons, stock Pieces)."
                        />
                        <FormItem label="Base UOM" asterisk invalid={Boolean(errors.baseUomId)} errorMessage={errors.baseUomId?.message}>
                            <Controller name="baseUomId" control={control} render={({ field }) => (
                                <Select<SelectOption>
                                    {...selectPortal}
                                    placeholder="Select base UOM"
                                    options={groupedBaseUomOptions}
                                    value={flatBaseUomOptions.find((o) => o.value === field.value) ?? null}
                                    onChange={(opt) => field.onChange(opt?.value ?? '')}
                                />
                            )} />
                            <p className="mt-1 text-xs text-gray-400">Primary unit for on-hand stock and inventory postings.</p>
                        </FormItem>
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Purchase UOM">
                                <Controller name="purchaseUomId" control={control} render={({ field }) => (
                                    <Select<SelectOption>
                                        {...selectPortal}
                                        isClearable
                                        isDisabled={!baseUomId}
                                        placeholder={baseUomId ? 'Same as base (optional)' : 'Select base UOM first'}
                                        options={alternateUomOptions}
                                        value={alternateUomOptions.find((o) => o.value === field.value) ?? null}
                                        onChange={(opt) => field.onChange(opt?.value ?? '')}
                                    />
                                )} />
                                <p className="mt-1 text-xs text-gray-400">Unit used on purchase orders.</p>
                            </FormItem>
                            <FormItem label="Sales UOM">
                                <Controller name="salesUomId" control={control} render={({ field }) => (
                                    <Select<SelectOption>
                                        {...selectPortal}
                                        isClearable
                                        isDisabled={!baseUomId}
                                        placeholder={baseUomId ? 'Same as base (optional)' : 'Select base UOM first'}
                                        options={alternateUomOptions}
                                        value={alternateUomOptions.find((o) => o.value === field.value) ?? null}
                                        onChange={(opt) => field.onChange(opt?.value ?? '')}
                                    />
                                )} />
                                <p className="mt-1 text-xs text-gray-400">Unit used on sales / issues.</p>
                            </FormItem>
                        </div>
                        <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                            {alternateUomHint}
                        </p>
                    </TabPanel>

                    {/* PHYSICAL */}
                    <TabPanel active={tab === 'physical'}>
                        <SectionHeader title="Weight & dimensions" />
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Weight"><Controller name="weight" control={control} render={({ field }) => <NumericInput placeholder="0" decimalScale={3} allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Weight UOM">
                                <Controller name="weightUom" control={control} render={({ field }) => (
                                    <UomCodeSelect category="weight" uoms={uoms} value={field.value} onChange={field.onChange} placeholder="Select weight UOM" />
                                )} />
                            </FormItem>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 md:grid-cols-4">
                            <FormItem label="Length"><Controller name="length" control={control} render={({ field }) => <NumericInput placeholder="0" decimalScale={2} allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Width"><Controller name="width" control={control} render={({ field }) => <NumericInput placeholder="0" decimalScale={2} allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Height"><Controller name="height" control={control} render={({ field }) => <NumericInput placeholder="0" decimalScale={2} allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Dim. UOM">
                                <Controller name="dimensionUom" control={control} render={({ field }) => (
                                    <UomCodeSelect category="dimension" uoms={uoms} value={field.value} onChange={field.onChange} placeholder="Select dimension UOM" />
                                )} />
                            </FormItem>
                        </div>
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Volume"><Controller name="volume" control={control} render={({ field }) => <NumericInput placeholder="0" decimalScale={3} allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Volume UOM">
                                <Controller name="volumeUom" control={control} render={({ field }) => (
                                    <UomCodeSelect category="volume" uoms={uoms} value={field.value} onChange={field.onChange} placeholder="Select volume UOM" />
                                )} />
                            </FormItem>
                        </div>
                        <SectionHeader title="Identifiers" className="mt-2" />
                        <FormItem
                            label="SKU"
                            invalid={Boolean(errors.sku)}
                            errorMessage={errors.sku?.message}
                        >
                            <Segment
                                value={skuMode}
                                onChange={(v) => handleSkuModeChange(v as SkuMode)}
                                className="w-full max-w-xs"
                            >
                                <Segment.Item value="auto">Auto-generate</Segment.Item>
                                <Segment.Item value="custom">Custom SKU</Segment.Item>
                            </Segment>
                            <div className="mt-3">
                                <Controller
                                    name="sku"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            disabled={skuMode === 'auto'}
                                            placeholder={
                                                skuMode === 'auto'
                                                    ? 'Assigned on save (e.g. SKU-000001)'
                                                    : 'e.g. DELL-LAT-7450'
                                            }
                                            className={skuMode === 'auto' ? '!bg-gray-100 dark:!bg-gray-700/50' : undefined}
                                            {...field}
                                        />
                                    )}
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-400">
                                {skuMode === 'auto'
                                    ? 'A unique SKU will be assigned automatically when the material is saved.'
                                    : 'Enter your own stock-keeping unit identifier.'}
                            </p>
                        </FormItem>
                    </TabPanel>

                    {/* TRACKING */}
                    <TabPanel active={tab === 'tracking'}>
                        <SectionHeader title="Tracking & compliance" />
                        <div className="flex flex-col gap-2">
                            <Controller name="batchManaged" control={control} render={({ field }) => <ToggleRow label="Batch managed" description="Track by batch/lot number." checked={field.value} onChange={field.onChange} />} />
                            <Controller name="serialManaged" control={control} render={({ field }) => <ToggleRow label="Serial managed" description="Assign unique serial number per unit." checked={field.value} onChange={field.onChange} />} />
                            <Controller name="qualityInspectionRequired" control={control} render={({ field }) => <ToggleRow label="Quality inspection" description="Route receipts through QC." checked={field.value} onChange={field.onChange} />} />
                            <Controller name="expiryManaged" control={control} render={({ field }) => <ToggleRow label="Expiry controlled" description="Enforce expiry date tracking." checked={field.value} onChange={field.onChange} />} />
                        </div>
                    </TabPanel>

                    {/* INVENTORY */}
                    <TabPanel active={tab === 'inventory'}>
                        <SectionHeader title="Availability" />
                        <div className="flex flex-col gap-2">
                            <Controller name="inventoryManaged" control={control} render={({ field }) => <ToggleRow label="Inventory managed" description="Include in on-hand stock." checked={field.value} onChange={field.onChange} />} />
                            <Controller name="purchasable" control={control} render={({ field }) => <ToggleRow label="Purchasable" description="Can be purchased." checked={field.value} onChange={field.onChange} />} />
                            <Controller name="sellable" control={control} render={({ field }) => <ToggleRow label="Sellable" description="Can be sold." checked={field.value} onChange={field.onChange} />} />
                        </div>
                        <SectionHeader title="Stock thresholds" className="mt-4" />
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Minimum stock" invalid={Boolean(errors.minimumStock)} errorMessage={errors.minimumStock?.message}>
                                <Controller name="minimumStock" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} />
                            </FormItem>
                            <FormItem label="Maximum stock" invalid={Boolean(errors.maximumStock)} errorMessage={errors.maximumStock?.message}>
                                <Controller name="maximumStock" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} />
                            </FormItem>
                            <FormItem label="Safety stock"><Controller name="safetyStock" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Reorder point" invalid={Boolean(errors.reorderPoint)} errorMessage={errors.reorderPoint?.message}>
                                <Controller name="reorderPoint" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} />
                            </FormItem>
                            <FormItem label="Reorder quantity"><Controller name="reorderQuantity" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Lead time (days)"><Controller name="leadTimeDays" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={0} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                            <FormItem label="Min order qty"><Controller name="minimumOrderQuantity" control={control} render={({ field }) => <NumericInput placeholder="0" allowNegative={false} decimalScale={2} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} /></FormItem>
                        </div>
                    </TabPanel>

                    {/* VALUATION */}
                    <TabPanel active={tab === 'valuation'}>
                        <SectionHeader title="Valuation & organisation" />
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Valuation method">
                                <Controller name="valuationMethod" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} isClearable placeholder="Select method" options={VALUATION_METHOD_OPTIONS} value={VALUATION_METHOD_OPTIONS.find((o) => o.value === field.value) ?? null} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Standard cost">
                                <Controller name="standardCost" control={control} render={({ field }) => <NumericInput placeholder="0.00" thousandSeparator="," decimalScale={2} fixedDecimalScale allowNegative={false} value={field.value ?? 0} onValueChange={(v) => field.onChange(v.floatValue ?? 0)} />} />
                            </FormItem>
                            <FormItem label="Currency">
                                <Controller name="currencyId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} isClearable placeholder="Currency" options={currencyOptions} value={currencyOptions.find((o) => o.value === field.value) ?? null} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Valuation class">
                                <Controller name="valuationClassId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} isClearable placeholder="Valuation class" options={valClassOptions} value={valClassOptions.find((o) => o.value === field.value) ?? null} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Company">
                                <Controller name="companyId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} isClearable placeholder="Company" options={companyOptions} value={companyOptions.find((o) => o.value === field.value) ?? null} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Default warehouse">
                                <Controller name="defaultWarehouseId" control={control} render={({ field }) => (
                                    <Select<SelectOption> {...selectPortal} isClearable placeholder="Warehouse" options={warehouseOptions} value={warehouseOptions.find((o) => o.value === field.value) ?? null} onChange={(opt) => field.onChange(opt?.value ?? '')} />
                                )} />
                            </FormItem>
                            <FormItem label="Preferred supplier">
                                <Controller name="preferredSupplierId" control={control} render={({ field }) => (
                                    <Select<SelectOption>
                                        {...selectPortal}
                                        isClearable
                                        isSearchable
                                        placeholder="Search supplier…"
                                        options={supplierOptions}
                                        value={supplierOptions.find((o) => o.value === field.value) ?? null}
                                        onChange={(opt) => field.onChange(opt?.value ?? '')}
                                    />
                                )} />
                            </FormItem>
                        </div>
                    </TabPanel>
            </Form>
        </FormDialog>
    )
}

const TabPanel = ({ active, children }: { active: boolean; children: ReactNode }) => (
    <div role="tabpanel" aria-hidden={!active} className={active ? 'block' : 'hidden'}>{children}</div>
)

function countErrors(value: unknown): number {
    if (!value || typeof value !== 'object') return 0
    if ('message' in (value as Record<string, unknown>) && 'type' in (value as Record<string, unknown>)) return 1
    let total = 0
    for (const key of Object.keys(value as Record<string, unknown>)) { total += countErrors((value as Record<string, unknown>)[key]) }
    return total
}

const SectionHeader = ({ title, description, className }: { title: string; description?: string; className?: string }) => (
    <div className={`mb-4 ${className ?? ''}`}>
        <h6 className="text-sm font-semibold heading-text">{title}</h6>
        {description && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
)

const ToggleRow = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary/60 hover:bg-primary-subtle/40 dark:border-gray-700 dark:hover:border-primary/60">
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <p className="text-sm font-semibold heading-text">{label}</p>
                {checked && <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 text-[10px]">On</Tag>}
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className="shrink-0"><Switcher checked={checked} onChange={onChange} /></div>
    </label>
)

const FieldValidIcon = ({ show }: { show: boolean }) => show ? <HiCheckCircle className="text-emerald-500" /> : null

const FieldFootnote = ({ hint, count, max }: { hint?: string; count?: number; max?: number }) => {
    const showCount = typeof count === 'number' && typeof max === 'number'
    if (!hint && !showCount) return null
    const over = showCount && (count as number) > (max as number)
    const nearLimit = showCount && !over && (count as number) >= (max as number) - 5
    return (
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="truncate">{hint ?? ''}</span>
            {showCount && <span className={over ? 'font-semibold text-red-500' : nearLimit ? 'font-medium text-amber-500' : 'tabular-nums'}>{count}/{max}</span>}
        </div>
    )
}

export default MaterialFormDialog
