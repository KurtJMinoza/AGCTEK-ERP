'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    HiOutlineChevronDown,
    HiOutlineChevronUp,
    HiOutlinePhotograph,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineStar,
    HiOutlineTrash,
    HiOutlineUpload,
    HiOutlineX,
    HiStar,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Switcher from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import type { Material } from '@/modules/mm/material-master/types'
import { uploadProductImage } from '@/modules/sd/services/productCatalogService'
import type {
    OptionsVariantsDraft,
    OptionDisplayStyle,
    OptionDraft,
    OptionValueDraft,
    ProductOptionsVariants,
    VariantDraft,
} from '@/modules/sd/services/productOptionVariantsService'

type MaterialOption = { value: string; label: string }
type StyleOption = { value: OptionDisplayStyle; label: string }

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/

const DISPLAY_STYLE_OPTIONS: StyleOption[] = [
    { value: 'BUTTON', label: 'Buttons / pills' },
    { value: 'DROPDOWN', label: 'Dropdown' },
    { value: 'SWATCH', label: 'Color swatches' },
    { value: 'IMAGE', label: 'Image swatches' },
    { value: 'TILE', label: 'Tiles' },
]

const splitValues = (raw: string) =>
    raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)

/** Stable key for one option-value combination (order-sensitive). */
const comboKey = (values: string[]) =>
    values.map((value) => value.trim().toLowerCase()).join('|')

const numberOrNull = (raw: string) => (raw === '' ? null : Number(raw))

/**
 * Product Options admin editor (ecommerce standard): option groups with a
 * storefront display style (buttons, dropdown, color/image swatches, tiles),
 * per-value swatch data, a cartesian variant generator, and responsive variant
 * cards with SKU/barcode/price/compare-at/cost/weight/active/default/reorder,
 * uploaded images, linked MM material and a variant-image display mode.
 */
const ProductOptionsPanel = ({
    value,
    onChange,
    parentPrice = 0,
    parentCompareAt = null,
    defaultSku = '',
    disabled = false,
    errors = [],
}: {
    initial: ProductOptionsVariants | null
    /** Lifted draft state (parent owns it so save happens on form submit). */
    value: OptionsVariantsDraft | null
    onChange: (draft: OptionsVariantsDraft | null) => void
    /** Parent product price shown as the inherited value. */
    parentPrice?: number
    /** Parent original/compare-at price shown as the inherited value. */
    parentCompareAt?: number | null
    defaultSku?: string
    disabled?: boolean
    /** Validation messages — shown after a failed save attempt. */
    errors?: string[]
}) => {
    const [materials, setMaterials] = useState<Material[]>([])
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
    const [uploadingValue, setUploadingValue] = useState<string | null>(null)
    const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
    const [generateHint, setGenerateHint] = useState<string | null>(null)

    useEffect(() => {
        materialService
            .list({ limit: 500, page: 1 } as never)
            .then((res: unknown) => {
                setMaterials(
                    Array.isArray(res)
                        ? (res as Material[])
                        : ((res as { data?: Material[] })?.data ?? []),
                )
            })
            .catch(() => {})
    }, [])

    const materialOptions = useMemo<MaterialOption[]>(
        () =>
            materials.map((material) => ({
                value: material.id,
                label: `${material.materialCode} — ${material.materialName}`,
            })),
        [materials],
    )

    const draft: OptionsVariantsDraft = value ?? { options: [], variants: [] }
    const showValidation = errors.length > 0
    const variantImageMode = draft.variantImageMode ?? 'replace'

    const setOptions = (options: OptionDraft[]) =>
        onChange({ ...draft, options })

    const setVariants = (variants: VariantDraft[]) =>
        onChange({ ...draft, variants })

    const updateOption = (index: number, patch: Partial<OptionDraft>) =>
        setOptions(
            draft.options.map((option, i) =>
                i === index ? { ...option, ...patch } : option,
            ),
        )

    const updateOptionValue = (
        optionIndex: number,
        valueIndex: number,
        patch: Partial<OptionValueDraft>,
    ) =>
        setOptions(
            draft.options.map((option, i) =>
                i === optionIndex
                    ? {
                          ...option,
                          values: option.values.map((entry, vi) =>
                              vi === valueIndex
                                  ? { ...entry, ...patch }
                                  : entry,
                          ),
                      }
                    : option,
            ),
        )

    /**
     * Comma-separated text → value objects, keeping swatch data by name. The
     * raw text is kept on the draft until blur, so typing commas and spaces
     * is never swallowed mid-keystroke.
     */
    const setOptionValuesFromText = (optionIndex: number, text: string) => {
        const current = draft.options[optionIndex]?.values ?? []
        const next: OptionValueDraft[] = splitValues(text).map(
            (value) =>
                current.find((entry) => entry.value === value) ?? { value },
        )
        updateOption(optionIndex, { values: next, rawValues: text })
    }

    const handleValueImage = async (
        optionIndex: number,
        valueIndex: number,
        file: File | null | undefined,
    ) => {
        if (!file) return
        const key = `${optionIndex}:${valueIndex}`
        setUploadingValue(key)
        try {
            const url = await uploadProductImage(file)
            updateOptionValue(optionIndex, valueIndex, { imageUrl: url })
        } catch {
            /* surfaced by the product form's error toast on save */
        } finally {
            setUploadingValue(null)
        }
    }

    const handleVariantImage = async (
        index: number,
        file: File | null | undefined,
    ) => {
        if (!file) return
        setUploadingIndex(index)
        setImageErrors((prev) => {
            const next = { ...prev }
            delete next[index]
            return next
        })
        try {
            const url = await uploadProductImage(file)
            updateVariant(index, { imageUrl: url })
        } catch (error) {
            setImageErrors((prev) => ({
                ...prev,
                [index]:
                    error instanceof Error
                        ? error.message
                        : 'Unable to upload image',
            }))
        } finally {
            setUploadingIndex(null)
        }
    }

    const updateVariant = (index: number, patch: Partial<VariantDraft>) =>
        setVariants(
            draft.variants.map((variant, i) =>
                i === index ? { ...variant, ...patch } : variant,
            ),
        )

    /** One default variant per product. */
    const setDefaultVariant = (index: number) =>
        setVariants(
            draft.variants.map((variant, i) => ({
                ...variant,
                isDefault: i === index,
            })),
        )

    const moveVariant = (index: number, delta: number) => {
        const target = index + delta
        if (target < 0 || target >= draft.variants.length) return
        const next = [...draft.variants]
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        setVariants(next.map((variant, i) => ({ ...variant, sortOrder: i })))
    }

    /**
     * Merge-generate the variant matrix: existing combinations keep their
     * edits (SKU, price, image, material…), new combinations are added, and
     * combinations whose option values no longer exist are dropped.
     */
    const generateVariants = () => {
        if (draft.options.length === 0) {
            setGenerateHint('Add an option group first.')
            return
        }
        const missing = draft.options.filter(
            (option) => option.values.filter((entry) => entry.value.trim()).length === 0,
        )
        if (missing.length > 0) {
            const label =
                missing.length === 1
                    ? `"${missing[0].name.trim() || `Option ${draft.options.indexOf(missing[0]) + 1}`}"`
                    : `${missing.length} options`
            setGenerateHint(`Add at least one value to ${label} before generating.`)
            return
        }
        setGenerateHint(null)

        const combos: string[][] = [[]]
        for (const option of draft.options) {
            const values = option.values
                .map((entry) => entry.value.trim())
                .filter(Boolean)
            const next: string[][] = []
            for (const combo of combos) {
                for (const value of values) {
                    next.push([...combo, value])
                }
            }
            combos.length = 0
            combos.push(...next)
        }

        const base = (defaultSku.trim() || 'VAR')
            .toUpperCase()
            .replace(/[^A-Z0-9._-]/g, '')
        const existing = new Map(
            draft.variants.map((variant) => [
                comboKey(variant.optionValues),
                variant,
            ]),
        )
        const usedSkus = new Set(draft.variants.map((variant) => variant.sku))
        const makeSku = (index: number) => {
            let n = index + 1
            let sku = `${base}-${String(n).padStart(2, '0')}`
            while (usedSkus.has(sku)) {
                n += 1
                sku = `${base}-${String(n).padStart(2, '0')}`
            }
            usedSkus.add(sku)
            return sku
        }

        const previousDefault = draft.variants.find(
            (variant) => variant.isDefault,
        )
        const defaultKey = previousDefault
            ? comboKey(previousDefault.optionValues)
            : null

        const variants: VariantDraft[] = combos.map((combo, index) => {
            const found = existing.get(comboKey(combo))
            if (found) {
                return {
                    ...found,
                    variantName: found.variantName || combo.join(' / '),
                    optionValues: combo,
                    isDefault: false,
                    sortOrder: index,
                }
            }
            return {
                variantName: combo.join(' / '),
                sku: makeSku(index),
                barcode: '',
                // Null = inherit the parent product price until an admin
                // sets a variant-specific override.
                price: null,
                compareAtPrice: null,
                cost: null,
                imageUrl: '',
                weight: null,
                isActive: true,
                isDefault: false,
                sortOrder: index,
                materialId: null,
                companyId: null,
                optionValues: combo,
            }
        })

        const keepDefault =
            defaultKey !== null &&
            variants.some(
                (variant) => comboKey(variant.optionValues) === defaultKey,
            )
        setVariants(
            variants.map((variant, index) => ({
                ...variant,
                isDefault: keepDefault
                    ? comboKey(variant.optionValues) === defaultKey
                    : index === 0,
            })),
        )
    }

    return (
        <div className="flex flex-col gap-5">
            {showValidation ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Fix these before saving:
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-red-600 dark:text-red-300">
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* ── Option groups ─────────────────────────────────────────── */}
            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Options
                            {draft.options.length > 0 ? (
                                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                    {draft.options.length}
                                </span>
                            ) : null}
                        </p>
                        <p className="text-xs text-gray-500">
                            Add option groups like Size, Color, Bottle Size,
                            Flavor, Pack, Count or Type. A product with options
                            requires a variant on the storefront before it can
                            be added to a cart.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        disabled={disabled}
                        onClick={() =>
                            setOptions([
                                ...draft.options,
                                {
                                    name: '',
                                    isRequired: true,
                                    displayStyle: 'BUTTON',
                                    values: [],
                                },
                            ])
                        }
                    >
                        Add option
                    </Button>
                </div>

                {draft.options.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900/40">
                        No options yet — the product is sold as a single item.
                    </p>
                ) : (
                    <div className="mt-3 flex flex-col gap-3">
                        {draft.options.map((option, optionIndex) => {
                            const nameInvalid =
                                showValidation && !option.name.trim()
                            const duplicateValues =
                                new Set(
                                    option.values.map((v) => v.value.trim()),
                                ).size !== option.values.length
                            const valuesInvalid =
                                showValidation &&
                                (option.values.length === 0 ||
                                    duplicateValues)
                            const style = option.displayStyle ?? 'BUTTON'
                            return (
                                <div
                                    key={optionIndex}
                                    className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/40"
                                >
                                    <div className="flex flex-wrap items-start gap-3">
                                        <FormItem
                                            label={`Option ${optionIndex + 1} name`}
                                            className="min-w-40 flex-1"
                                            invalid={nameInvalid}
                                            errorMessage={
                                                nameInvalid
                                                    ? 'Enter a name (e.g. Size, Color)'
                                                    : undefined
                                            }
                                        >
                                            <Input
                                                placeholder="e.g. Size, Color, Bottle Size"
                                                value={option.name}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateOption(optionIndex, {
                                                        name: event.target
                                                            .value,
                                                    })
                                                }
                                            />
                                        </FormItem>
                                        <FormItem
                                            label="Display style"
                                            className="min-w-36"
                                        >
                                            <Select<StyleOption>
                                                size="sm"
                                                options={DISPLAY_STYLE_OPTIONS}
                                                value={
                                                    DISPLAY_STYLE_OPTIONS.find(
                                                        (entry) =>
                                                            entry.value ===
                                                            style,
                                                    ) ?? DISPLAY_STYLE_OPTIONS[0]
                                                }
                                                onChange={(entry) =>
                                                    updateOption(optionIndex, {
                                                        displayStyle:
                                                            entry?.value ??
                                                            'BUTTON',
                                                    })
                                                }
                                            />
                                        </FormItem>
                                        <FormItem label="Required">
                                            <Switcher
                                                checked={option.isRequired}
                                                disabled={disabled}
                                                onChange={(checked) =>
                                                    updateOption(optionIndex, {
                                                        isRequired: checked,
                                                    })
                                                }
                                            />
                                        </FormItem>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            customColorClass={() =>
                                                'text-red-500 hover:text-red-600'
                                            }
                                            icon={<HiOutlineTrash />}
                                            disabled={disabled}
                                            onClick={() =>
                                                setOptions(
                                                    draft.options.filter(
                                                        (_, i) =>
                                                            i !== optionIndex,
                                                    ),
                                                )
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <FormItem
                                        label="Values (comma separated)"
                                        invalid={valuesInvalid}
                                        errorMessage={
                                            option.values.length === 0
                                                ? 'Add at least one value (e.g. Black, White)'
                                                : duplicateValues
                                                  ? 'Remove duplicate values'
                                                  : undefined
                                        }
                                    >
                                        <Input
                                            placeholder="e.g. Black, White"
                                            disabled={disabled}
                                            value={
                                                option.rawValues ??
                                                option.values
                                                    .map(
                                                        (entry) =>
                                                            entry.value,
                                                    )
                                                    .join(', ')
                                            }
                                            onChange={(event) =>
                                                setOptionValuesFromText(
                                                    optionIndex,
                                                    event.target.value,
                                                )
                                            }
                                            onBlur={() =>
                                                updateOption(optionIndex, {
                                                    rawValues: undefined,
                                                })
                                            }
                                        />
                                    </FormItem>
                                    {option.values.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {option.values.map(
                                                (entry, valueIndex) => {
                                                    const uploadKey = `${optionIndex}:${valueIndex}`
                                                    return (
                                                        <span
                                                            key={`${entry.value}-${valueIndex}`}
                                                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                        >
                                                            {style ===
                                                                'SWATCH' && (
                                                                <input
                                                                    type="color"
                                                                    aria-label={`Color for ${entry.value}`}
                                                                    disabled={
                                                                        disabled
                                                                    }
                                                                    className="h-4 w-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
                                                                    value={
                                                                        entry.swatchColor ??
                                                                        '#d1d5db'
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateOptionValue(
                                                                            optionIndex,
                                                                            valueIndex,
                                                                            {
                                                                                swatchColor:
                                                                                    event
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                            {style ===
                                                                'IMAGE' &&
                                                                (entry.imageUrl ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={
                                                                            entry.imageUrl
                                                                        }
                                                                        alt=""
                                                                        className="h-4 w-4 rounded-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <HiOutlinePhotograph className="h-3.5 w-3.5 text-emerald-500" />
                                                                ))}
                                                            {entry.value}
                                                            {style ===
                                                                'IMAGE' && (
                                                                <label
                                                                    className="cursor-pointer text-emerald-600 hover:text-emerald-700"
                                                                    title="Upload value image"
                                                                >
                                                                    {uploadingValue ===
                                                                    uploadKey ? (
                                                                        <Spinner
                                                                            size={
                                                                                12
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <HiOutlineUpload className="h-3.5 w-3.5" />
                                                                    )}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        className="hidden"
                                                                        disabled={
                                                                            disabled
                                                                        }
                                                                        onChange={(
                                                                            event,
                                                                        ) => {
                                                                            void handleValueImage(
                                                                                optionIndex,
                                                                                valueIndex,
                                                                                event
                                                                                    .target
                                                                                    .files?.[0],
                                                                            )
                                                                            event.target.value =
                                                                                ''
                                                                        }}
                                                                    />
                                                                </label>
                                                            )}
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove ${entry.value}`}
                                                                disabled={
                                                                    disabled
                                                                }
                                                                onClick={() =>
                                                                    updateOption(
                                                                        optionIndex,
                                                                        {
                                                                            values:
                                                                                option.values.filter(
                                                                                    (
                                                                                        _,
                                                                                        i,
                                                                                    ) =>
                                                                                        i !==
                                                                                        valueIndex,
                                                                                ),
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <HiOutlineX className="h-3 w-3" />
                                                            </button>
                                                        </span>
                                                    )
                                                },
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* ── Variants ──────────────────────────────────────────────── */}
            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Variants
                            {draft.variants.length > 0 ? (
                                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                    {draft.variants.length}
                                </span>
                            ) : null}
                        </p>
                        <p className="text-xs text-gray-500">
                            Each combination is its own sellable item: SKU,
                            barcode, price, stock (linked MM material) and
                            image. Star one as the default.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <Switcher
                                checked={variantImageMode === 'replace'}
                                disabled={disabled}
                                onChange={(checked) =>
                                    onChange({
                                        ...draft,
                                        variantImageMode: checked
                                            ? 'replace'
                                            : 'keep',
                                    })
                                }
                            />
                            Variant images replace the main photo
                        </label>
                        {showValidation ? (
                            <span className="text-xs font-medium text-red-600">
                                {errors.length} issue
                                {errors.length > 1 ? 's' : ''}
                            </span>
                        ) : null}
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            disabled={
                                disabled || draft.options.length === 0
                            }
                            onClick={generateVariants}
                        >
                            Generate variants
                        </Button>
                    </div>
                </div>

                {generateHint ? (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        {generateHint}
                    </p>
                ) : null}

                {draft.variants.length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {draft.variants.map((variant, variantIndex) => {
                            const nameInvalid =
                                showValidation && !variant.variantName.trim()
                            const sku = variant.sku.trim()
                            const skuInvalid =
                                showValidation &&
                                (!sku || !SKU_PATTERN.test(sku))
                            const priceInvalid =
                                showValidation &&
                                variant.price !== null &&
                                (!Number.isFinite(variant.price) ||
                                    variant.price < 0)
                            const uploading =
                                uploadingIndex === variantIndex
                            return (
                                <div
                                    key={variantIndex}
                                    className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                            type="button"
                                            title="Set as default variant"
                                            aria-label="Set as default variant"
                                            disabled={disabled}
                                            className="shrink-0 rounded p-1 hover:bg-amber-50"
                                            onClick={() =>
                                                setDefaultVariant(variantIndex)
                                            }
                                        >
                                            {variant.isDefault ? (
                                                <HiStar className="h-4 w-4 text-amber-400" />
                                            ) : (
                                                <HiOutlineStar className="h-4 w-4 text-gray-300" />
                                            )}
                                        </button>
                                        <Input
                                            size="sm"
                                            className="min-w-36 flex-1"
                                            aria-label="Variant name"
                                            value={variant.variantName}
                                            disabled={disabled}
                                            onChange={(event) =>
                                                updateVariant(variantIndex, {
                                                    variantName:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                        <label className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <Switcher
                                                checked={variant.isActive}
                                                disabled={disabled}
                                                onChange={(checked) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            isActive: checked,
                                                        },
                                                    )
                                                }
                                            />
                                            Active
                                        </label>
                                        <button
                                            type="button"
                                            aria-label="Move variant up"
                                            disabled={
                                                disabled || variantIndex === 0
                                            }
                                            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                            onClick={() =>
                                                moveVariant(variantIndex, -1)
                                            }
                                        >
                                            <HiOutlineChevronUp className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Move variant down"
                                            disabled={
                                                disabled ||
                                                variantIndex ===
                                                    draft.variants.length - 1
                                            }
                                            className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                                            onClick={() =>
                                                moveVariant(variantIndex, 1)
                                            }
                                        >
                                            <HiOutlineChevronDown className="h-4 w-4" />
                                        </button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            customColorClass={() =>
                                                'text-red-500 hover:text-red-600'
                                            }
                                            icon={<HiOutlineTrash />}
                                            disabled={disabled}
                                            aria-label="Remove variant"
                                            onClick={() =>
                                                setVariants(
                                                    draft.variants.filter(
                                                        (_, i) =>
                                                            i !== variantIndex,
                                                    ),
                                                )
                                            }
                                        />
                                    </div>
                                    <p className="mt-1 text-[11px] text-gray-400">
                                        {variant.optionValues.join(' / ') ||
                                            'no options'}
                                        {variant.isDefault ? (
                                            <span className="ml-1.5 font-semibold text-amber-500">
                                                Default
                                            </span>
                                        ) : null}
                                    </p>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <FormItem
                                            label="SKU"
                                            invalid={skuInvalid}
                                            errorMessage={
                                                skuInvalid
                                                    ? 'Letters, digits, . _ - (start with a letter/digit)'
                                                    : undefined
                                            }
                                        >
                                            <Input
                                                size="sm"
                                                className="font-mono"
                                                value={variant.sku}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            sku: event.target.value.toUpperCase(),
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <FormItem label="Barcode">
                                            <Input
                                                size="sm"
                                                className="font-mono"
                                                placeholder="Optional"
                                                value={variant.barcode ?? ''}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            barcode:
                                                                event.target
                                                                    .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <FormItem
                                            label="Price"
                                            invalid={priceInvalid}
                                            errorMessage={
                                                priceInvalid
                                                    ? 'Enter a valid price (0 or more)'
                                                    : undefined
                                            }
                                            extra={
                                                <span
                                                    className={
                                                        variant.price === null
                                                            ? 'text-[10px] font-medium text-gray-400'
                                                            : 'text-[10px] font-medium text-emerald-600'
                                                    }
                                                >
                                                    {variant.price === null
                                                        ? 'Inherited from product'
                                                        : 'Custom'}
                                                </span>
                                            }
                                        >
                                            <Input
                                                size="sm"
                                                type="number"
                                                placeholder={`Inherit ₱${parentPrice.toFixed(2)}`}
                                                value={
                                                    variant.price === null
                                                        ? ''
                                                        : String(variant.price)
                                                }
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            price: numberOrNull(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <FormItem
                                            label="Compare at"
                                            extra={
                                                <span className="text-[10px] font-medium text-gray-400">
                                                    {variant.price === null
                                                        ? 'Inherits product'
                                                        : 'Variant only'}
                                                </span>
                                            }
                                        >
                                            <Input
                                                size="sm"
                                                type="number"
                                                placeholder={
                                                    parentCompareAt != null
                                                        ? `Inherit ₱${parentCompareAt.toFixed(2)}`
                                                        : 'Optional'
                                                }
                                                value={
                                                    variant.compareAtPrice ===
                                                    null
                                                        ? ''
                                                        : String(
                                                              variant.compareAtPrice,
                                                          )
                                                }
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            compareAtPrice:
                                                                numberOrNull(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <FormItem label="Cost">
                                            <Input
                                                size="sm"
                                                type="number"
                                                placeholder="Optional"
                                                value={
                                                    variant.cost === null
                                                        ? ''
                                                        : String(variant.cost)
                                                }
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            cost: numberOrNull(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <FormItem label="Weight">
                                            <Input
                                                size="sm"
                                                type="number"
                                                placeholder="Inherit product weight"
                                                value={
                                                    variant.weight === null
                                                        ? ''
                                                        : String(
                                                              variant.weight,
                                                          )
                                                }
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateVariant(
                                                        variantIndex,
                                                        {
                                                            weight: numberOrNull(
                                                                event.target
                                                                    .value,
                                                            ),
                                                        },
                                                    )
                                                }
                                            />
                                        </FormItem>
                                        <div className="col-span-2">
                                            <FormItem label="MM material (stock link)">
                                                <Select<MaterialOption>
                                                    size="sm"
                                                    isClearable
                                                    placeholder="Link MM material"
                                                    options={materialOptions}
                                                    value={
                                                        materialOptions.find(
                                                            (o) =>
                                                                o.value ===
                                                                variant.materialId,
                                                        ) ?? null
                                                    }
                                                    onChange={(option) =>
                                                        updateVariant(
                                                            variantIndex,
                                                            {
                                                                materialId:
                                                                    option?.value ??
                                                                    null,
                                                            },
                                                        )
                                                    }
                                                />
                                            </FormItem>
                                        </div>
                                        <div className="col-span-2">
                                            <FormItem
                                                label="Variant image"
                                                invalid={Boolean(
                                                    imageErrors[variantIndex],
                                                )}
                                                errorMessage={
                                                    imageErrors[variantIndex]
                                                }
                                            >
                                                <div className="flex items-center gap-3">
                                                    {variant.imageUrl ? (
                                                        <span className="relative shrink-0">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={
                                                                    variant.imageUrl
                                                                }
                                                                alt=""
                                                                className="h-12 w-12 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
                                                            />
                                                            <button
                                                                type="button"
                                                                aria-label="Remove image"
                                                                disabled={
                                                                    disabled
                                                                }
                                                                className="absolute -right-1.5 -top-1.5 rounded-full border border-gray-200 bg-white p-0.5 text-gray-500 shadow hover:text-red-500 dark:border-gray-600 dark:bg-gray-800"
                                                                onClick={() =>
                                                                    updateVariant(
                                                                        variantIndex,
                                                                        {
                                                                            imageUrl:
                                                                                '',
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <HiOutlineX className="h-3 w-3" />
                                                            </button>
                                                        </span>
                                                    ) : (
                                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300 dark:border-gray-700 dark:text-gray-600">
                                                            <HiOutlinePhotograph className="h-5 w-5" />
                                                        </span>
                                                    )}
                                                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-primary hover:text-primary dark:border-gray-600 dark:text-gray-300">
                                                        {uploading ? (
                                                            <>
                                                                <Spinner
                                                                    size={14}
                                                                />{' '}
                                                                Uploading…
                                                            </>
                                                        ) : (
                                                            <>
                                                                <HiOutlineUpload className="h-4 w-4" />{' '}
                                                                {variant.imageUrl
                                                                    ? 'Replace image'
                                                                    : 'Upload image'}
                                                            </>
                                                        )}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            disabled={
                                                                disabled ||
                                                                uploadingIndex !==
                                                                    null
                                                            }
                                                            onChange={(event) => {
                                                                void handleVariantImage(
                                                                    variantIndex,
                                                                    event.target
                                                                        .files?.[0],
                                                                )
                                                                event.target.value =
                                                                    ''
                                                            }}
                                                        />
                                                    </label>
                                                    <span className="text-[11px] text-gray-400">
                                                        PNG, JPG, WEBP — up to 5
                                                        MB
                                                    </span>
                                                </div>
                                            </FormItem>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : draft.options.length > 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900/40">
                        Click{' '}
                        <span className="font-semibold">Generate variants</span>{' '}
                        to create one card per combination — then edit SKU,
                        price, image, default and material per card.
                    </p>
                ) : null}
            </section>

            {draft.options.length > 0 && !disabled ? (
                <Button
                    size="xs"
                    variant="plain"
                    customColorClass={() =>
                        'text-red-500 hover:text-red-600'
                    }
                    icon={<HiOutlineTrash />}
                    onClick={() => onChange({ options: [], variants: [] })}
                >
                    Reset options & variants (simple product)
                </Button>
            ) : null}
        </div>
    )
}

export default ProductOptionsPanel
