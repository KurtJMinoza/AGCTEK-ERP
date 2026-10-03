'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HiOutlineCube } from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import NumericInput from '@/components/shared/NumericInput'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { Form, FormItem } from '@/components/ui/Form'
import { isRenderableImageSrc } from '@/utils/productImage'
import ProductCatalogImageGallery from './ProductCatalogImageGallery'
import { PRODUCT_DIVISIONS } from '../catalogs/productDivisions'
import ProductCatalogMaterialSection from './ProductCatalogMaterialSection'
import { productMaterialAssignmentService } from '../services/productMaterialAssignmentService'
import { productAttribute } from '../services/productCatalogService'
import {
    productImageGallery,
    suggestProductSku,
    type ProductInput,
    type SdProductRecord,
    type SdProductType,
} from '../services/productCatalogService'

const MAX_PRICE = 999_999_999.99

const productSchema = z
    .object({
        divisionId: z.string().min(1, 'Select a division'),
        autoGenerateSku: z.boolean(),
        sku: z.string().trim().max(64),
        imageGallery: z.array(z.string()),
        name: z.string().trim().min(2, 'At least 2 characters').max(200),
        category: z.string().min(1, 'Select a category'),
        price: z
            .number({ message: 'Price is required' })
            .min(0, 'Cannot be negative')
            .max(MAX_PRICE, 'Price is too large'),
        originalPrice: z.number().min(0).max(MAX_PRICE).nullable(),
        imageUrl: z
            .string()
            .trim()
            .max(1000)
            .refine(
                (value) => value === '' || isRenderableImageSrc(value),
                'Use a full https:// link or a site path starting with /',
            ),
        badge: z.string().trim().max(60),
        description: z.string().trim().max(2000),
        sortOrder: z.number().int().min(0).max(100_000),
        isActive: z.boolean(),
        productType: z.literal('STOCK_ITEM'),
        companyId: z.string(),
        materialLinkMode: z.enum(['single', 'multiple']),
        materialIds: z.array(z.string()),
    })
    .refine(
        (values) =>
            values.originalPrice === null || values.originalPrice > values.price,
        {
            path: ['originalPrice'],
            message: 'Must be higher than the selling price, or leave blank',
        },
    )
    .refine(
        (values) =>
            values.companyId.trim().length > 0 && values.materialIds.length > 0,
        {
            path: ['materialIds'],
            message: 'Select company and at least one MM material',
        },
    )
    .refine(
        (values) =>
            values.materialLinkMode !== 'single' || values.materialIds.length <= 1,
        {
            path: ['materialIds'],
            message: 'Single-material mode allows only one MM material',
        },
    )
    .refine(
        (values) =>
            values.autoGenerateSku ||
            (values.sku.trim().length > 0 &&
                /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.sku.trim())),
        {
            path: ['sku'],
            message: 'Enter a SKU or turn on auto-generate',
        },
    )

type FormShape = z.infer<typeof productSchema>
type Option = { value: string; label: string }

const FORM_ID = 'sd-product-form'

const DIVISION_OPTIONS: Option[] = PRODUCT_DIVISIONS.map((d) => ({
    value: d.id,
    label: d.label,
}))

const STOCK_ITEM_LABEL = 'Stock item (inventory)'

const categoryOptions = (divisionId: string): Option[] =>
    (PRODUCT_DIVISIONS.find((d) => d.id === divisionId)?.categories ?? []).map(
        (category) => ({ value: category, label: category }),
    )

const toFormValues = (
    product: SdProductRecord | null | undefined,
    defaultDivisionId: string,
): FormShape =>
    product
        ? {
              divisionId: product.divisionId,
              autoGenerateSku: false,
              sku: product.sku,
              name: product.name,
              category: product.category,
              price: product.price,
              originalPrice: product.originalPrice,
              imageUrl: product.imageUrl,
              imageGallery: productImageGallery(product).slice(1),
              badge: product.badge ?? '',
              description: product.description,
              sortOrder: product.sortOrder,
              isActive: product.isActive,
              productType: 'STOCK_ITEM',
              companyId: '',
              materialLinkMode: 'single',
              materialIds: [],
          }
        : {
              divisionId: defaultDivisionId,
              autoGenerateSku: true,
              sku: '',
              name: '',
              category: '',
              price: 0,
              originalPrice: null,
              imageUrl: '',
              imageGallery: [],
              badge: '',
              description: '',
              sortOrder: 0,
              isActive: true,
              productType: 'STOCK_ITEM',
              companyId: '',
              materialLinkMode: 'single',
              materialIds: [],
          }

type ProductFormDialogProps = {
    isOpen: boolean
    mode: 'create' | 'edit'
    product?: SdProductRecord | null
    /** Preselected division for new products (the current filter). */
    defaultDivisionId?: string
    saving?: boolean
    onClose: () => void
    onSubmit: (values: ProductInput) => void | Promise<void>
}

const ProductFormDialog = ({
    isOpen,
    mode,
    product,
    defaultDivisionId = '',
    saving,
    onClose,
    onSubmit,
}: ProductFormDialogProps) => {
    const {
        control,
        handleSubmit,
        reset,
        setValue,
        getValues,
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(product, defaultDivisionId),
        resolver: zodResolver(productSchema),
    })

    useEffect(() => {
        if (isOpen) reset(toFormValues(product, defaultDivisionId))
    }, [isOpen, product, defaultDivisionId, reset])

    const divisionId = useWatch({ control, name: 'divisionId' })
    const autoGenerateSku = useWatch({ control, name: 'autoGenerateSku' })
    const categories = categoryOptions(divisionId)
    const editing = mode === 'edit'
    const [uploading, setUploading] = useState(false)
    const [editMaterialIds, setEditMaterialIds] = useState<string[]>([])
    const [editCompanyId, setEditCompanyId] = useState<string | null>(null)
    const [mmStockRefreshKey, setMmStockRefreshKey] = useState(0)

    useEffect(() => {
        if (isOpen) setMmStockRefreshKey((k) => k + 1)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || editing || !autoGenerateSku || !divisionId) return
        let cancelled = false
        void suggestProductSku(divisionId)
            .then((sku) => {
                if (!cancelled) setValue('sku', sku)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [isOpen, editing, autoGenerateSku, divisionId, setValue])

    useEffect(() => {
        if (!isOpen || mode !== 'edit' || !product?.id) {
            setEditMaterialIds([])
            setEditCompanyId(null)
            return
        }
        let cancelled = false
        void productMaterialAssignmentService
            .listForProduct(product.id)
            .then((rows) => {
                if (cancelled) return
                const active = rows.filter((r) => r.status === 'ACTIVE')
                const ids = active.map((r) => r.materialId)
                setEditMaterialIds(ids)
                setEditCompanyId(active[0]?.companyId ?? null)
                if (ids.length) {
                    setValue('materialIds', ids)
                    setValue('companyId', active[0]?.companyId ?? '')
                    const mode = productAttribute<'single' | 'multiple' | undefined>(
                        product,
                        'materialLinkMode',
                        ids.length > 1 ? 'multiple' : 'single',
                    )
                    setValue('materialLinkMode', mode === 'multiple' ? 'multiple' : 'single')
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setEditMaterialIds([])
                    setEditCompanyId(null)
                }
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, mode, product, setValue])

    const onValid = (values: FormShape) => {
        const {
            productType: _productType,
            autoGenerateSku: autoSku,
            imageGallery,
            materialIds,
            materialLinkMode,
            companyId,
            ...rest
        } = values
        const payload: ProductInput = {
            ...rest,
            sku: autoSku ? '' : values.sku.toUpperCase(),
            badge: values.badge || null,
            productType: 'STOCK_ITEM' satisfies SdProductType,
            autoGenerateSku: !editing && autoSku,
            imageGallery,
        }
        if (!editing) {
            payload.materialIds = materialIds
            payload.materialLinkMode = materialLinkMode
            payload.companyId = companyId
        }
        return onSubmit(payload)
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title={editing ? 'Edit Product' : 'Add New Product'}
            description={
                editing && product
                    ? `${product.sku} · ${product.name}`
                    : 'Stock products must be linked to an MM material so orders can reserve and fulfill inventory.'
            }
            icon={<HiOutlineCube />}
            footer={
                <div className="flex items-center gap-2">
                    <Button type="button" size="sm" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        type="submit"
                        form={FORM_ID}
                        loading={saving}
                        disabled={uploading}
                    >
                        {editing ? 'Save changes' : 'Add product'}
                    </Button>
                </div>
            }
        >
            <Form id={FORM_ID} onSubmit={handleSubmit(onValid)}>
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem
                        label="Division"
                        asterisk
                        invalid={Boolean(errors.divisionId)}
                        errorMessage={errors.divisionId?.message}
                    >
                        <Controller
                            name="divisionId"
                            control={control}
                            render={({ field }) => (
                                <Select<Option>
                                    isSearchable={false}
                                    isDisabled={editing}
                                    placeholder="Select storefront"
                                    options={DIVISION_OPTIONS}
                                    value={
                                        DIVISION_OPTIONS.find(
                                            (o) => o.value === field.value,
                                        ) ?? null
                                    }
                                    onChange={(option) => {
                                        const next = option?.value ?? ''
                                        field.onChange(next)
                                        const valid = categoryOptions(next).some(
                                            (c) => c.value === getValues('category'),
                                        )
                                        if (!valid) setValue('category', '')
                                    }}
                                />
                            )}
                        />
                    </FormItem>
                    {!editing ? (
                        <FormItem label="SKU source">
                            <Controller
                                name="autoGenerateSku"
                                control={control}
                                render={({ field }) => (
                                    <div className="flex h-12 items-center gap-3">
                                        <Switcher
                                            checked={field.value}
                                            onChange={(checked) => {
                                                field.onChange(checked)
                                                if (checked && divisionId) {
                                                    void suggestProductSku(divisionId).then(
                                                        (sku) => setValue('sku', sku),
                                                    )
                                                }
                                            }}
                                        />
                                        <span className="text-sm">
                                            {field.value
                                                ? 'Auto-generate SKU'
                                                : 'Manual SKU'}
                                        </span>
                                    </div>
                                )}
                            />
                        </FormItem>
                    ) : null}
                    <FormItem
                        label="SKU"
                        asterisk={!autoGenerateSku && !editing}
                        invalid={Boolean(errors.sku)}
                        errorMessage={errors.sku?.message}
                        extra={
                            editing ? (
                                <span className="text-xs text-gray-500">
                                    Fixed after creation
                                </span>
                            ) : autoGenerateSku ? (
                                <span className="text-xs text-gray-500">
                                    Assigned when you save (preview below)
                                </span>
                            ) : null
                        }
                    >
                        <Controller
                            name="sku"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    placeholder="e.g. VIT-D3-90"
                                    disabled={editing || autoGenerateSku}
                                    {...field}
                                    onChange={(e) =>
                                        field.onChange(e.target.value.toUpperCase())
                                    }
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Product name"
                        asterisk
                        className="md:col-span-2"
                        invalid={Boolean(errors.name)}
                        errorMessage={errors.name?.message}
                    >
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <Input placeholder="e.g. Vitamin D3 2000 IU" {...field} />
                            )}
                        />
                    </FormItem>
                    <FormItem label="Product type">
                        <Input readOnly disabled value={STOCK_ITEM_LABEL} />
                    </FormItem>
                    {(errors.materialIds || errors.companyId) && (
                        <p className="md:col-span-2 text-sm text-red-600">
                            {errors.materialIds?.message ?? errors.companyId?.message}
                        </p>
                    )}
                    <ProductCatalogMaterialSection
                        control={control}
                        editing={editing}
                        divisionId={divisionId}
                        productDivisionId={product?.divisionId}
                        initialMaterialIds={editMaterialIds}
                        initialCompanyId={editCompanyId}
                        mmStockRefreshKey={mmStockRefreshKey}
                    />
                    <FormItem
                        label="Category"
                        asterisk
                        invalid={Boolean(errors.category)}
                        errorMessage={errors.category?.message}
                    >
                        <Controller
                            name="category"
                            control={control}
                            render={({ field }) => (
                                <Select<Option>
                                    isSearchable={false}
                                    isDisabled={!divisionId}
                                    placeholder={
                                        divisionId ? 'Select category' : 'Select a division first'
                                    }
                                    options={categories}
                                    value={
                                        categories.find((o) => o.value === field.value) ??
                                        null
                                    }
                                    onChange={(option) => field.onChange(option?.value ?? '')}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Badge"
                        invalid={Boolean(errors.badge)}
                        errorMessage={errors.badge?.message}
                    >
                        <Controller
                            name="badge"
                            control={control}
                            render={({ field }) => (
                                <Input placeholder="e.g. Best Seller (optional)" {...field} />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Selling price (PHP)"
                        asterisk
                        invalid={Boolean(errors.price)}
                        errorMessage={errors.price?.message}
                    >
                        <Controller
                            name="price"
                            control={control}
                            render={({ field }) => (
                                <NumericInput
                                    placeholder="0.00"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    value={field.value}
                                    onValueChange={(v) => field.onChange(v.floatValue ?? 0)}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Original price (PHP)"
                        invalid={Boolean(errors.originalPrice)}
                        errorMessage={errors.originalPrice?.message}
                    >
                        <Controller
                            name="originalPrice"
                            control={control}
                            render={({ field }) => (
                                <NumericInput
                                    placeholder="Optional, shown struck through"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    value={field.value ?? ''}
                                    onValueChange={(v) =>
                                        field.onChange(v.floatValue ?? null)
                                    }
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Product photos"
                        className="md:col-span-2"
                        invalid={Boolean(errors.imageUrl)}
                        errorMessage={errors.imageUrl?.message}
                    >
                        <Controller
                            name="imageUrl"
                            control={control}
                            render={({ field: coverField }) => (
                                <Controller
                                    name="imageGallery"
                                    control={control}
                                    render={({ field: galleryField }) => (
                                        <ProductCatalogImageGallery
                                            coverUrl={coverField.value}
                                            galleryUrls={galleryField.value}
                                            onCoverChange={coverField.onChange}
                                            onGalleryChange={galleryField.onChange}
                                            onUploadingChange={setUploading}
                                            disabled={saving || !isOpen}
                                        />
                                    )}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Description"
                        className="md:col-span-2"
                        invalid={Boolean(errors.description)}
                        errorMessage={errors.description?.message}
                    >
                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    textArea
                                    rows={3}
                                    placeholder="Short description shown on the product card"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Display order"
                        invalid={Boolean(errors.sortOrder)}
                        errorMessage={errors.sortOrder?.message}
                    >
                        <Controller
                            name="sortOrder"
                            control={control}
                            render={({ field }) => (
                                <NumericInput
                                    placeholder="0"
                                    decimalScale={0}
                                    allowNegative={false}
                                    value={field.value}
                                    onValueChange={(v) => field.onChange(v.floatValue ?? 0)}
                                />
                            )}
                        />
                        <p className="mt-1 text-xs text-gray-500">Lower numbers show first.</p>
                    </FormItem>
                    <FormItem label="Visible on storefront">
                        <Controller
                            name="isActive"
                            control={control}
                            render={({ field }) => (
                                <div className="flex h-12 items-center gap-3">
                                    <Switcher
                                        checked={field.value}
                                        onChange={(checked) => field.onChange(checked)}
                                    />
                                    <span className="text-sm">
                                        {field.value ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                            )}
                        />
                    </FormItem>
                </div>
                {editing && product?.attributes ? (
                    <p className="text-xs text-gray-500">
                        Detailed storefront content (features, specs, reviews) is kept as-is.
                    </p>
                ) : null}
            </Form>
        </FormDialog>
    )
}

export default ProductFormDialog
