'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HiOutlineCube, HiOutlinePlus } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { addVariantsToProduct } from '../services/productCatalogService'
import { productOptionVariantsService } from '../services/productOptionVariantsService'
import type { SdProductRecord } from '../services/productCatalogService'
import type { ProductOptionsVariants } from '../services/productOptionVariantsService'

type OptionValueEntry = { optionName: string; values: string[] }

type NewVariantRow = {
    optionValues: string[]
    variantName: string
    sku: string
    barcode: string
    price: string
    imageUrl: string
    enabled: boolean
}

type Props = {
    isOpen: boolean
    product: SdProductRecord
    onClose: () => void
    onSuccess: () => void
}

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

/**
 * Add Variant Dialog — opens from inside an existing product's detail page.
 * Creates new variant combinations under the same parent product. Never creates
 * a new parent product. Uses POST /sd/products/:id/variants.
 */
const AddVariantDialog = ({ isOpen, product, onClose, onSuccess }: Props) => {
    const [optionsPayload, setOptionsPayload] = useState<ProductOptionsVariants | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Per-option new values the user wants to add
    const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})

    // Generated new variant rows
    const [newVariants, setNewVariants] = useState<NewVariantRow[]>([])
    const [generatedOnce, setGeneratedOnce] = useState(false)

    // Load existing options+variants when the dialog opens
    useEffect(() => {
        if (!isOpen || !product.id) return
        setLoading(true)
        setNewValueInputs({})
        setNewVariants([])
        setGeneratedOnce(false)
        productOptionVariantsService
            .getForProduct(product.id)
            .then(setOptionsPayload)
            .catch(() => setOptionsPayload(null))
            .finally(() => setLoading(false))
    }, [isOpen, product.id])

    const existingOptions = useMemo(() => optionsPayload?.options ?? [], [optionsPayload])
    const existingVariants = useMemo(() => optionsPayload?.variants ?? [], [optionsPayload])
    const existingCombinations = useMemo(
        () =>
            new Set(
                existingVariants.map((v) =>
                    v.optionValues.map((ov) => ov.value.toLowerCase().trim()).join('|'),
                ),
            ),
        [existingVariants],
    )

    // Parse new values per option
    const parsedNewValues: OptionValueEntry[] = existingOptions.map((opt) => {
        const raw = newValueInputs[opt.name] ?? ''
        const newVals = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .filter(
                (v) =>
                    !opt.values.some(
                        (existing) =>
                            existing.value.toLowerCase() === v.toLowerCase(),
                    ),
            )
        return { optionName: opt.name, values: newVals }
    })

    // Generate variant matrix from existing + new option values
    const generateVariants = useCallback(() => {
        if (!optionsPayload) return
        // Build the full value set per option
        const allValues: string[][] = existingOptions.map((opt) => {
            const existing = opt.values.map((v) => v.value)
            const newVals = parsedNewValues.find((p) => p.optionName === opt.name)?.values ?? []
            return [...existing, ...newVals]
        })

        // Cartesian product
        const combos: string[][] = [[]]
        for (const vals of allValues) {
            const next: string[][] = []
            for (const combo of combos) {
                for (const val of vals) {
                    next.push([...combo, val])
                }
            }
            combos.length = 0
            combos.push(...next)
        }

        // Filter out existing combinations
        const newCombos = combos.filter((combo) => {
            const key = combo.map((v) => v.toLowerCase().trim()).join('|')
            return !existingCombinations.has(key)
        })

        const base = product.sku.replace(/[^A-Z0-9._-]/gi, '').toUpperCase()
        const usedSkus = new Set(existingVariants.map((v) => v.sku))
        let skuCounter = existingVariants.length + 1

        setNewVariants(
            newCombos.map((combo) => {
                let sku: string
                do {
                    sku = `${base}-V${String(skuCounter++).padStart(2, '0')}`
                } while (usedSkus.has(sku))
                usedSkus.add(sku)
                return {
                    optionValues: combo,
                    variantName: combo.join(' / '),
                    sku,
                    barcode: '',
                    price: '',
                    imageUrl: '',
                    enabled: true,
                }
            }),
        )
        setGeneratedOnce(true)
    }, [optionsPayload, existingOptions, parsedNewValues, existingCombinations, existingVariants, product.sku])

    const updateVariant = (index: number, patch: Partial<NewVariantRow>) => {
        setNewVariants((prev) =>
            prev.map((v, i) => (i === index ? { ...v, ...patch } : v)),
        )
    }

    const handleSubmit = async () => {
        const enabledVariants = newVariants.filter((v) => v.enabled)
        if (enabledVariants.length === 0) {
            notify('danger', 'No variants', 'Enable at least one new variant.')
            return
        }
        setSaving(true)
        try {
            await addVariantsToProduct(product.id, {
                newOptionValues: parsedNewValues.filter((p) => p.values.length > 0),
                newVariants: enabledVariants.map((v) => ({
                    enabled: true,
                    sku: v.sku || undefined,
                    barcode: v.barcode || undefined,
                    price: v.price ? Number(v.price) : undefined,
                    imageUrl: v.imageUrl || undefined,
                    optionValues: v.optionValues,
                })),
            })
            notify(
                'success',
                'Variants added',
                `${enabledVariants.length} variant(s) added to ${product.name}.`,
            )
            onSuccess()
            onClose()
        } catch (err) {
            notify(
                'danger',
                'Variant creation failed',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            width={900}
            title={`Add Variant to ${product.name}`}
            description={`${product.sku} · Variants are added to this product — no new product is created.`}
            icon={<HiOutlinePlus />}
            footer={
                <div className="flex items-center gap-2">
                    <Button size="sm" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={saving}
                        disabled={loading || newVariants.filter((v) => v.enabled).length === 0}
                        onClick={handleSubmit}
                    >
                        Add Variant{newVariants.filter((v) => v.enabled).length > 1 ? 's' : ''}
                    </Button>
                </div>
            }
        >
            {loading ? (
                <p className="text-sm text-gray-500">Loading product options…</p>
            ) : (
                <div className="space-y-6">
                    {/* Parent info (read-only) */}
                    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Parent Product (read-only)
                        </p>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                            <div>
                                <span className="text-xs text-gray-500">Name:</span>{' '}
                                {product.name}
                            </div>
                            <div>
                                <span className="text-xs text-gray-500">SKU:</span>{' '}
                                {product.sku}
                            </div>
                            {product.company ? (
                                <div>
                                    <span className="text-xs text-gray-500">Company:</span>{' '}
                                    {product.company.name}
                                </div>
                            ) : null}
                            <div>
                                <span className="text-xs text-gray-500">Category:</span>{' '}
                                {product.category}
                            </div>
                        </div>
                    </div>

                    {/* Existing options and adding new values */}
                    {existingOptions.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            This product has no options configured. Convert it to a variable product first.
                        </p>
                    ) : (
                        <section>
                            <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Option Values
                            </p>
                            <p className="mb-3 text-xs text-gray-500">
                                Add new option values (comma-separated). Existing values are shown as tags.
                                Only new combinations will be generated.
                            </p>
                            <div className="space-y-3">
                                {existingOptions.map((opt) => (
                                    <div key={opt.id}>
                                        <FormItem label={opt.name}>
                                            <div className="mb-2 flex flex-wrap gap-1">
                                                {opt.values.map((v) => (
                                                    <span
                                                        key={v.id}
                                                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                                    >
                                                        {v.value}
                                                    </span>
                                                ))}
                                            </div>
                                            <Input
                                                size="sm"
                                                placeholder={`Add new values, e.g. Extra Large, XXL`}
                                                value={newValueInputs[opt.name] ?? ''}
                                                onChange={(e) =>
                                                    setNewValueInputs((prev) => ({
                                                        ...prev,
                                                        [opt.name]: e.target.value,
                                                    }))
                                                }
                                            />
                                            {(parsedNewValues.find((p) => p.optionName === opt.name)?.values.length ?? 0) > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {parsedNewValues
                                                        .find((p) => p.optionName === opt.name)
                                                        ?.values.map((v) => (
                                                            <span
                                                                key={v}
                                                                className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                            >
                                                                + {v}
                                                            </span>
                                                        ))}
                                                </div>
                                            )}
                                        </FormItem>
                                    </div>
                                ))}
                            </div>
                            <Button
                                size="sm"
                                className="mt-3"
                                icon={<HiOutlineCube />}
                                disabled={saving}
                                onClick={generateVariants}
                            >
                                Generate new combinations
                            </Button>
                        </section>
                    )}

                    {/* Generated new variant rows */}
                    {generatedOnce && newVariants.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No new combinations found. All combinations already exist.
                        </p>
                    ) : null}

                    {newVariants.length > 0 ? (
                        <section>
                            <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                New Variants ({newVariants.filter((v) => v.enabled).length} enabled)
                            </p>
                            <div className="space-y-2">
                                {newVariants.map((v, i) => (
                                    <div
                                        key={i}
                                        className={`rounded-lg border p-3 ${v.enabled ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800' : 'border-gray-100 bg-gray-50 opacity-50 dark:border-gray-800 dark:bg-gray-900'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={v.enabled}
                                                onChange={(e) =>
                                                    updateVariant(i, { enabled: e.target.checked })
                                                }
                                            />
                                            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {v.variantName}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {v.optionValues.join(' / ')}
                                            </span>
                                        </div>
                                        {v.enabled ? (
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                <FormItem label="SKU">
                                                    <Input
                                                        size="sm"
                                                        className="font-mono"
                                                        value={v.sku}
                                                        onChange={(e) =>
                                                            updateVariant(i, {
                                                                sku: e.target.value.toUpperCase(),
                                                            })
                                                        }
                                                    />
                                                </FormItem>
                                                <FormItem label="Barcode">
                                                    <Input
                                                        size="sm"
                                                        placeholder="Optional"
                                                        value={v.barcode}
                                                        onChange={(e) =>
                                                            updateVariant(i, { barcode: e.target.value })
                                                        }
                                                    />
                                                </FormItem>
                                                <FormItem label="Price override">
                                                    <Input
                                                        size="sm"
                                                        type="number"
                                                        placeholder={`Inherit ₱${product.price.toFixed(2)}`}
                                                        value={v.price}
                                                        onChange={(e) =>
                                                            updateVariant(i, { price: e.target.value })
                                                        }
                                                    />
                                                </FormItem>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
            )}
        </FormDialog>
    )
}

export default AddVariantDialog
