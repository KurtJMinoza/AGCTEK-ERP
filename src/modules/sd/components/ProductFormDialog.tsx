'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HiOutlineArrowLeft, HiOutlineArrowRight, HiOutlineCube } from 'react-icons/hi'
import Steps from '@/components/ui/Steps'
import FormDialog from '@/components/shared/FormDialog'
import NumericInput from '@/components/shared/NumericInput'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { Form, FormItem } from '@/components/ui/Form'
import { isRenderableImageSrc } from '@/utils/productImage'
import ProductCatalogImageGallery from './ProductCatalogImageGallery'
import { RETAIL_DIVISION_ID } from '@/types/storefront/retail'
import ProductCatalogMaterialSection from './ProductCatalogMaterialSection'
import { productMaterialAssignmentService } from '../services/productMaterialAssignmentService'
import { productAttribute } from '../services/productCatalogService'
import type { MaterialCatalogReference } from '../services/materialCatalogReferenceService'
import {
    EMPTY_MEASUREMENTS,
    measurementsFromMaterial,
    productMeasurements,
    type ProductMeasurements,
} from '../services/productMeasurements'
import { LPG_DIVISION_ID, isLpgAddon } from '../catalogs/lpgCatalog'
import {
    productImageGallery,
    productVideos,
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
        videoUrls: z.array(z.string()),
        addOn: z.boolean(),
        name: z.string().trim().min(2, 'At least 2 characters').max(200),
        price: z
            .number({ message: 'Selling price is required' })
            .min(0.01, 'Enter a selling price greater than zero')
            .max(MAX_PRICE, 'Price is too large'),
        originalPrice: z
            .number({ message: 'Original price is required' })
            .min(0.01, 'Enter an original price greater than zero')
            .max(MAX_PRICE, 'Price is too large'),
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
        measurements: z.object({
            unit: z.string().trim().max(120),
            weight: z.string().trim().max(120),
            dimensions: z.string().trim().max(120),
            volume: z.string().trim().max(120),
        }),
    })
    .refine((values) => values.originalPrice > values.price, {
        path: ['originalPrice'],
        message: 'Must be higher than the selling price',
    })
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
            values.materialLinkMode !== 'single' ||
            values.materialIds.length <= 1,
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

const CREATE_WIZARD_STEPS = [
    'Storefront',
    'MM material',
    'Pricing & media',
    'Details',
] as const

const CREATE_STEP_FIELDS: (keyof FormShape | `measurements.${keyof ProductMeasurements}`)[][] = [
    ['sku', 'name'],
    ['companyId', 'materialIds', 'materialLinkMode'],
    ['price', 'originalPrice', 'badge', 'imageUrl'],
    ['description', 'sortOrder', 'isActive'],
]

const BADGE_PRESETS = ['Best Seller', 'New', 'Sale', 'Hot Deal', 'Limited']

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
              price: product.price,
              originalPrice:
                  product.originalPrice ??
                  (undefined as unknown as FormShape['originalPrice']),
              imageUrl: product.imageUrl,
              imageGallery: productImageGallery(product).filter(
                  (url) => url !== product.imageUrl,
              ),
              videoUrls: productVideos(product),
              addOn: isLpgAddon(product),
              badge: product.badge ?? '',
              description: product.description,
              sortOrder: product.sortOrder,
              isActive: product.isActive,
              productType: 'STOCK_ITEM',
              companyId: '',
              materialLinkMode: 'single',
              materialIds: [],
              measurements: productMeasurements(product),
          }
        : {
              divisionId: defaultDivisionId || RETAIL_DIVISION_ID,
              autoGenerateSku: true,
              sku: '',
              name: '',
              price: undefined as unknown as number,
              originalPrice: undefined as unknown as number,
              imageUrl: '',
              imageGallery: [],
              videoUrls: [],
              addOn: false,
              badge: '',
              description: '',
              sortOrder: 0,
              isActive: true,
              productType: 'STOCK_ITEM',
              companyId: '',
              materialLinkMode: 'single',
              materialIds: [],
              measurements: { ...EMPTY_MEASUREMENTS },
          }

const MEASUREMENT_FIELDS: {
    key: keyof ProductMeasurements
    label: string
    placeholder: string
}[] = [
    { key: 'unit', label: 'Unit of measure', placeholder: 'e.g. PCS (Piece)' },
    { key: 'weight', label: 'Weight', placeholder: 'e.g. 0.25 KG' },
    {
        key: 'dimensions',
        label: 'Dimensions (L × W × H)',
        placeholder: 'e.g. 30 × 20 × 10 CM',
    },
    { key: 'volume', label: 'Volume', placeholder: 'e.g. 1.5 L' },
]

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
    defaultDivisionId = RETAIL_DIVISION_ID,
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
        trigger,
        setError,
        formState: { errors },
    } = useForm<FormShape>({
        defaultValues: toFormValues(product, defaultDivisionId),
        resolver: zodResolver(productSchema),
    })

    /** Primary material whose MM measurements were last applied to the form. */
    const measuredMaterialRef = useRef<string | null>(null)

    /** Category of the primary linked material, owned by Materials Management. */
    const [mmCategory, setMmCategory] = useState<string | null>(null)
    /** Valuation currency from the primary linked MM material (pricing labels). */
    const [valuationCurrency, setValuationCurrency] = useState<string | null>(
        null,
    )

    useEffect(() => {
        if (!isOpen) return
        reset(toFormValues(product, defaultDivisionId))
        measuredMaterialRef.current = null
        setMmCategory(product?.category ?? null)
        setValuationCurrency(null)
        setWizardStep(0)
    }, [isOpen, product, defaultDivisionId, reset])

    const divisionId = useWatch({ control, name: 'divisionId' })
    const autoGenerateSku = useWatch({ control, name: 'autoGenerateSku' })
    const materialIds = useWatch({ control, name: 'materialIds' })
    const editing = mode === 'edit'
    const createWizard = !editing
    const [wizardStep, setWizardStep] = useState(0)
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
                    const mode = productAttribute<
                        'single' | 'multiple' | undefined
                    >(
                        product,
                        'materialLinkMode',
                        ids.length > 1 ? 'multiple' : 'single',
                    )
                    setValue(
                        'materialLinkMode',
                        mode === 'multiple' ? 'multiple' : 'single',
                    )
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

    const applyMaterialMeasurements = (
        materials: MaterialCatalogReference[],
    ) => {
        const primary = materials[0]
        setMmCategory(primary?.general.materialCategory ?? null)
        setValuationCurrency(primary?.valuation.currencyCode ?? null)
        if (!primary || measuredMaterialRef.current === primary.materialId)
            return
        // Editing: the first load only fills blanks so saved shop specs survive.
        const keepSaved = editing && measuredMaterialRef.current === null
        measuredMaterialRef.current = primary.materialId
        const fromMm = measurementsFromMaterial(primary)
        const current = getValues('measurements')
        setValue(
            'measurements',
            keepSaved
                ? {
                      unit: current.unit || fromMm.unit,
                      weight: current.weight || fromMm.weight,
                      dimensions: current.dimensions || fromMm.dimensions,
                      volume: current.volume || fromMm.volume,
                  }
                : fromMm,
            { shouldDirty: true },
        )
    }

    const onValid = (values: FormShape) => {
        const {
            productType: _productType,
            autoGenerateSku: autoSku,
            imageGallery,
            videoUrls,
            addOn,
            materialIds,
            materialLinkMode,
            companyId,
            measurements,
            ...rest
        } = values
        const attributes: Record<string, unknown> = {
            ...(editing ? (product?.attributes ?? {}) : {}),
        }
        // `imageGallery` (saved as attributes.gallery) is the full ordered photo list.
        delete attributes.images
        if (Object.values(measurements).some((v) => v.trim() !== '')) {
            attributes.measurements = measurements
        } else {
            delete attributes.measurements
        }
        if (videoUrls.length) attributes.videos = videoUrls
        else delete attributes.videos
        if (values.divisionId === LPG_DIVISION_ID && addOn) {
            attributes.addOn = true
        } else {
            delete attributes.addOn
        }
        const payload: ProductInput = {
            ...rest,
            sku: autoSku ? '' : values.sku.toUpperCase(),
            badge: values.badge || null,
            productType: 'STOCK_ITEM' satisfies SdProductType,
            autoGenerateSku: !editing && autoSku,
            imageGallery,
            attributes,
        }
        if (!editing) {
            payload.materialIds = materialIds
            payload.materialLinkMode = materialLinkMode
            payload.companyId = companyId
        }
        return onSubmit(payload)
    }

    const goWizardNext = async () => {
        const fields = CREATE_STEP_FIELDS[wizardStep]
        const ok = await trigger(fields as (keyof FormShape)[])
        if (!ok) return

        const values = getValues()
        if (wizardStep === 1) {
            if (!values.companyId?.trim()) {
                setError('companyId', { message: 'Select a company' })
                return
            }
            if (!values.materialIds?.length) {
                setError('materialIds', {
                    message: 'Select at least one MM material',
                })
                return
            }
            if (
                values.materialLinkMode === 'single' &&
                values.materialIds.length > 1
            ) {
                setError('materialIds', {
                    message: 'Single-material mode allows only one MM material',
                })
                return
            }
        }
        if (wizardStep === 2) {
            if (
                values.price != null &&
                values.originalPrice != null &&
                values.originalPrice <= values.price
            ) {
                setError('originalPrice', {
                    message: 'Must be higher than the selling price',
                })
                return
            }
        }
        setWizardStep((s) => Math.min(s + 1, CREATE_WIZARD_STEPS.length - 1))
    }

    const wizardStepHint = createWizard
        ? [
              'Choose storefront and product identity.',
              'Link to Materials Management for inventory and fulfillment.',
              'Set prices, badge, and storefront media.',
              'Description, specs, display order, and visibility.',
          ][wizardStep]
        : null

    const showStep = (step: number) => editing || wizardStep === step

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title={editing ? 'Edit Product' : 'Add New Product'}
            description={
                editing && product
                    ? `${product.sku} · ${product.name}`
                    : createWizard
                      ? (wizardStepHint ??
                        'Stock products must be linked to an MM material.')
                      : 'Stock products must be linked to an MM material so orders can reserve and fulfill inventory.'
            }
            icon={<HiOutlineCube />}
            headerExtra={
                createWizard ? (
                    <Steps current={wizardStep} className="mt-3">
                        {CREATE_WIZARD_STEPS.map((title) => (
                            <Steps.Item key={title} title={title} />
                        ))}
                    </Steps>
                ) : undefined
            }
            footerClassName={createWizard ? '!justify-between' : undefined}
            footer={
                createWizard ? (
                    <>
                        <div>
                            {wizardStep > 0 ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    icon={<HiOutlineArrowLeft />}
                                    disabled={saving}
                                    onClick={() =>
                                        setWizardStep((s) => Math.max(0, s - 1))
                                    }
                                >
                                    Back
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            {wizardStep < CREATE_WIZARD_STEPS.length - 1 ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="solid"
                                    disabled={uploading}
                                    onClick={() => void goWizardNext()}
                                >
                                    Next{' '}
                                    <HiOutlineArrowRight className="ml-1 inline" />
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    type="submit"
                                    form={FORM_ID}
                                    loading={saving}
                                    disabled={uploading}
                                >
                                    Add product
                                </Button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={saving}
                            onClick={onClose}
                        >
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
                            Save changes
                        </Button>
                    </div>
                )
            }
        >
            <Form id={FORM_ID} onSubmit={handleSubmit(onValid)}>
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    {showStep(0) ? (
                    <>
                    <Controller
                        name="divisionId"
                        control={control}
                        render={({ field }) => (
                            <input type="hidden" {...field} />
                        )}
                    />
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
                                                    void suggestProductSku(
                                                        divisionId,
                                                    ).then((sku) =>
                                                        setValue('sku', sku),
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
                                        field.onChange(
                                            e.target.value.toUpperCase(),
                                        )
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
                                <Input
                                    placeholder="e.g. Vitamin D3 2000 IU"
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    </>
                    ) : null}
                    {showStep(1) ? (
                    <>
                    {(errors.materialIds || errors.companyId) && (
                        <p className="md:col-span-2 text-sm text-red-600">
                            {errors.materialIds?.message ??
                                errors.companyId?.message}
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
                        onMaterialsLoaded={applyMaterialMeasurements}
                    />
                    <FormItem
                        label="Category"
                        extra={
                            <span className="text-xs text-gray-500">
                                From Materials Management
                            </span>
                        }
                    >
                        <Input
                            readOnly
                            disabled
                            value={
                                (materialIds.length ? mmCategory : null) ?? ''
                            }
                            placeholder="Set by the linked MM material"
                        />
                    </FormItem>
                    {valuationCurrency ? (
                        <FormItem
                            label="Valuation currency"
                            extra={
                                <span className="text-xs text-gray-500">
                                    From MM material valuation — use for
                                    storefront prices
                                </span>
                            }
                        >
                            <Input readOnly disabled value={valuationCurrency} />
                        </FormItem>
                    ) : null}
                    {divisionId === LPG_DIVISION_ID ? (
                        <FormItem label="LPG add-on">
                            <Controller
                                name="addOn"
                                control={control}
                                render={({ field }) => (
                                    <div className="flex h-12 items-center gap-3">
                                        <Switcher
                                            checked={field.value}
                                            onChange={(checked) =>
                                                field.onChange(checked)
                                            }
                                        />
                                        <span className="text-sm">
                                            {field.value
                                                ? 'Add-on — needs a refill or set in the same order'
                                                : 'Can be ordered on its own'}
                                        </span>
                                    </div>
                                )}
                            />
                        </FormItem>
                    ) : null}
                    </>
                    ) : null}
                    {showStep(2) ? (
                    <>
                    <FormItem
                        label="Badge"
                        invalid={Boolean(errors.badge)}
                        errorMessage={errors.badge?.message}
                    >
                        <Controller
                            name="badge"
                            control={control}
                            render={({ field }) => (
                                <>
                                    <Input
                                        placeholder="e.g. Best Seller (optional)"
                                        {...field}
                                    />
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {BADGE_PRESETS.map((preset) => {
                                            const active =
                                                field.value === preset
                                            return (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() =>
                                                        field.onChange(
                                                            active
                                                                ? ''
                                                                : preset,
                                                        )
                                                    }
                                                    className={
                                                        active
                                                            ? 'rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs font-semibold text-white'
                                                            : 'rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 hover:border-primary hover:text-primary dark:border-gray-600 dark:text-gray-300'
                                                    }
                                                >
                                                    {preset}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500">
                                        Shown as a red label on the product
                                        photo in the shop.
                                    </p>
                                </>
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label={
                            valuationCurrency
                                ? `Selling price (${valuationCurrency})`
                                : 'Selling price'
                        }
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
                                    onValueChange={(v) =>
                                        field.onChange(v.floatValue)
                                    }
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label={
                            valuationCurrency
                                ? `Original price (${valuationCurrency})`
                                : 'Original price'
                        }
                        asterisk
                        extra={
                            valuationCurrency ? (
                                <span className="text-xs text-gray-500">
                                    Matches MM valuation currency on the linked
                                    material
                                </span>
                            ) : (
                                <span className="text-xs text-gray-500">
                                    Link an MM material to use its valuation
                                    currency (e.g. PHP)
                                </span>
                            )
                        }
                        invalid={Boolean(errors.originalPrice)}
                        errorMessage={errors.originalPrice?.message}
                    >
                        <Controller
                            name="originalPrice"
                            control={control}
                            render={({ field }) => (
                                <NumericInput
                                    placeholder="MSRP, shown struck through"
                                    thousandSeparator=","
                                    decimalScale={2}
                                    fixedDecimalScale
                                    allowNegative={false}
                                    value={field.value ?? ''}
                                    onValueChange={(v) =>
                                        field.onChange(v.floatValue)
                                    }
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Product photos & videos"
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
                                        <Controller
                                            name="videoUrls"
                                            control={control}
                                            render={({ field: videoField }) => (
                                                <ProductCatalogImageGallery
                                                    coverUrl={coverField.value}
                                                    galleryUrls={
                                                        galleryField.value
                                                    }
                                                    videoUrls={videoField.value}
                                                    onCoverChange={
                                                        coverField.onChange
                                                    }
                                                    onGalleryChange={
                                                        galleryField.onChange
                                                    }
                                                    onVideosChange={
                                                        videoField.onChange
                                                    }
                                                    onUploadingChange={
                                                        setUploading
                                                    }
                                                    disabled={saving || !isOpen}
                                                />
                                            )}
                                        />
                                    )}
                                />
                            )}
                        />
                    </FormItem>
                    </>
                    ) : null}
                    {showStep(3) ? (
                    <>
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
                    <div className="md:col-span-2 mb-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            Specifications (shown in shop)
                        </p>
                        <p className="text-xs text-gray-500">
                            Auto-filled from the linked MM material — edit if
                            needed. Blank fields are hidden in the shop.
                        </p>
                    </div>
                    {MEASUREMENT_FIELDS.map(({ key, label, placeholder }) => (
                        <FormItem
                            key={key}
                            label={label}
                            invalid={Boolean(errors.measurements?.[key])}
                            errorMessage={errors.measurements?.[key]?.message}
                        >
                            <Controller
                                name={`measurements.${key}`}
                                control={control}
                                render={({ field }) => (
                                    <Input
                                        placeholder={placeholder}
                                        {...field}
                                    />
                                )}
                            />
                        </FormItem>
                    ))}
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
                                    onValueChange={(v) =>
                                        field.onChange(v.floatValue ?? 0)
                                    }
                                />
                            )}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Lower numbers show first.
                        </p>
                    </FormItem>
                    <FormItem label="Visible on storefront">
                        <Controller
                            name="isActive"
                            control={control}
                            render={({ field }) => (
                                <div className="flex h-12 items-center gap-3">
                                    <Switcher
                                        checked={field.value}
                                        onChange={(checked) =>
                                            field.onChange(checked)
                                        }
                                    />
                                    <span className="text-sm">
                                        {field.value ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                            )}
                        />
                    </FormItem>
                    </>
                    ) : null}
                </div>
                {editing && product?.attributes ? (
                    <p className="text-xs text-gray-500">
                        Detailed storefront content (features, specs, reviews)
                        is kept as-is.
                    </p>
                ) : null}
            </Form>
        </FormDialog>
    )
}

export default ProductFormDialog
