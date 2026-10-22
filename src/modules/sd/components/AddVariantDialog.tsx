'use client'

import { useEffect, useMemo, useState } from 'react'
import { HiOutlinePlus } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ProductMaterialPicker from './ProductMaterialPicker'
import VariantImageField from './VariantImageField'
import { addVariantToProduct } from '../services/productCatalogService'
import { productOptionVariantsService } from '../services/productOptionVariantsService'
import type { SdProductRecord } from '../services/productCatalogService'
import type { ProductOptionsVariants } from '../services/productOptionVariantsService'

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

/** RFC4122 v4 key so a double submit cannot create two variants. */
const newIdempotencyKey = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `variant-${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * Add Variant to an existing product.
 *
 * ONE modal, ONE form, ONE submission handler, ONE server request. The
 * variant links an EXISTING Material Master item — this dialog never creates
 * a material, a Stock Keeping Unit or stock.
 */
const AddVariantDialog = ({ isOpen, product, onClose, onSuccess }: Props) => {
    const [optionsPayload, setOptionsPayload] =
        useState<ProductOptionsVariants | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /** Selected option value per option group (by option id). */
    const [selections, setSelections] = useState<Record<string, string>>({})
    const [materialId, setMaterialId] = useState<string | null>(null)
    const [variantName, setVariantName] = useState('')
    const [price, setPrice] = useState('')
    const [barcode, setBarcode] = useState('')
    const [weight, setWeight] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
    /** The product was deleted (or the catalog was reset) while the modal was open. */
    const [productMissing, setProductMissing] = useState(false)

    // Load the product's options when the dialog opens.
    useEffect(() => {
        if (!isOpen || !product.id) return
        setLoading(true)
        setError(null)
        setProductMissing(false)
        setSelections({})
        setMaterialId(null)
        setVariantName('')
        setPrice('')
        setBarcode('')
        setWeight('')
        setImageUrl('')
        setIdempotencyKey(newIdempotencyKey())
        productOptionVariantsService
            .getForProduct(product.id)
            .then((payload) => {
                setOptionsPayload(payload)
                setProductMissing(false)
            })
            .catch((err) => {
                setOptionsPayload(null)
                // A missing product must be reported — a dead picker would look
                // like "I cannot select anything".
                if (
                    err instanceof Error &&
                    /not found/i.test(err.message)
                ) {
                    setProductMissing(true)
                }
            })
            .finally(() => setLoading(false))
    }, [isOpen, product.id])

    const options = useMemo(() => optionsPayload?.options ?? [], [optionsPayload])

    const optionValues = useMemo(
        () => options.map((option) => selections[option.id] ?? ''),
        [options, selections],
    )

    /** Option groups that still need a value. */
    const missingOptions = useMemo(
        () => options.filter((option) => !selections[option.id]),
        [options, selections],
    )

    /**
     * The button is only disabled while the request is in flight — a missing
     * option value must be REPORTED, never silently block the submit.
     */
    const canSubmit = !loading && !saving

    /** The single submission path. */
    const handleSubmit = async (event?: React.FormEvent) => {
        event?.preventDefault()
        if (saving) return
        if (!materialId) {
            setError(
                'Select the Material Master item this variant sells.',
            )
            return
        }
        if (missingOptions.length > 0) {
            setError(
                `Select a value for: ${missingOptions
                    .map((option) => option.name)
                    .join(', ')}.`,
            )
            return
        }

        setSaving(true)
        setError(null)
        try {
            await addVariantToProduct(product.id, {
                materialId,
                optionValues,
                variantName: variantName.trim() || undefined,
                price: price.trim() ? Number(price) : undefined,
                barcode: barcode.trim() || undefined,
                weight: weight.trim() ? Number(weight) : undefined,
                imageUrl: imageUrl.trim() || undefined,
                idempotencyKey,
            })
            notify(
                'success',
                'Variant added successfully',
                `The variant was added to ${product.name}.`,
            )
            onSuccess()
            onClose()
        } catch (err) {
            // Keep the modal open and show the actual validation error.
            setError(
                err instanceof Error
                    ? err.message
                    : 'The variant was not added. Please try again.',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={saving ? () => undefined : onClose}
            width={980}
            title={`Add Variant to ${product.name}`}
            description={`${product.sku} · The variant is added to this product — no new product and no new material is created.`}
            icon={<HiOutlinePlus />}
            footer={
                <div className="flex items-center gap-2">
                    <Button size="sm" disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        type="submit"
                        form="sd-add-variant-form"
                        loading={saving}
                        disabled={!canSubmit || productMissing}
                    >
                        {saving ? 'Adding variant…' : 'Add Variant'}
                    </Button>
                </div>
            }
        >
            {loading ? (
                <p className="text-sm text-gray-500">Loading product options…</p>
            ) : productMissing ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <p className="font-semibold">
                        This product no longer exists
                    </p>
                    <p className="mt-1 text-xs">
                        It was deleted while the dialog was open (the Product
                        Catalog was reset). Close this dialog and refresh the
                        catalog — a variant must belong to an existing parent
                        product.
                    </p>
                </div>
            ) : (
                <form
                    id="sd-add-variant-form"
                    onSubmit={handleSubmit}
                    className="space-y-6"
                >
                    {error ? (
                        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                            {error}
                        </p>
                    ) : null}

                    {/* Parent information (read-only) */}
                    <section className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/20 dark:bg-blue-500/5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                            Parent information
                        </p>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-700 sm:grid-cols-4 dark:text-gray-300">
                            <div>
                                <span className="text-xs text-gray-500">
                                    Product name:
                                </span>{' '}
                                {product.name}
                            </div>
                            <div>
                                <span className="text-xs text-gray-500">SKU:</span>{' '}
                                {product.sku}
                            </div>
                            <div>
                                <span className="text-xs text-gray-500">
                                    Company:
                                </span>{' '}
                                {product.company?.name ?? '—'}
                            </div>
                            <div>
                                <span className="text-xs text-gray-500">
                                    Category:
                                </span>{' '}
                                {product.category || '—'}
                            </div>
                        </div>
                    </section>

                    {/* Variant information */}
                    <section className="space-y-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Variant information
                        </p>

                        {options.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                This product has no customer-selectable options —
                                the variant will be created as a single item.
                            </p>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                                    {options.map((option) => {
                                        const missing = !selections[option.id]
                                        return (
                                            <FormItem
                                                key={option.id}
                                                label={option.name}
                                                asterisk
                                                errorMessage={
                                                    missing && error
                                                        ? 'Required'
                                                        : undefined
                                                }
                                            >
                                                <select
                                                    className={`w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-gray-900 ${
                                                        missing && error
                                                            ? 'border-red-400 dark:border-red-500'
                                                            : 'border-gray-300 dark:border-gray-700'
                                                    }`}
                                                    value={
                                                        selections[option.id] ??
                                                        ''
                                                    }
                                                    onChange={(e) =>
                                                        setSelections((prev) => ({
                                                            ...prev,
                                                            [option.id]:
                                                                e.target.value,
                                                        }))
                                                    }
                                                    disabled={saving}
                                                >
                                                    <option value="">
                                                        Select {option.name}…
                                                    </option>
                                                    {option.values.map(
                                                        (value) => (
                                                            <option
                                                                key={
                                                                    value.id
                                                                }
                                                                value={
                                                                    value.value
                                                                }
                                                            >
                                                                {value.value}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </FormItem>
                                        )
                                    })}
                                </div>
                                {missingOptions.length > 0 ? (
                                    <p className="text-xs font-medium text-amber-600">
                                        Still needed:{' '}
                                        {missingOptions
                                            .map((option) => option.name)
                                            .join(', ')}
                                    </p>
                                ) : null}
                            </>
                        )}

                        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                            <FormItem label="Variant display name">
                                <Input
                                    size="sm"
                                    value={variantName}
                                    placeholder={
                                        optionValues.filter(Boolean).join(' / ') ||
                                        'Defaults to the selected options'
                                    }
                                    onChange={(e) =>
                                        setVariantName(e.target.value)
                                    }
                                    disabled={saving}
                                />
                            </FormItem>
                            <FormItem label="Price override">
                                <Input
                                    size="sm"
                                    type="number"
                                    placeholder={`Inherit ₱${Number(product.price).toFixed(2)}`}
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    disabled={saving}
                                />
                            </FormItem>
                            <FormItem label="Barcode">
                                <Input
                                    size="sm"
                                    value={barcode}
                                    placeholder="Leave empty to use the material barcode"
                                    onChange={(e) => setBarcode(e.target.value)}
                                    disabled={saving}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Scanned at the POS. Defaults to the
                                    material&apos;s own barcode.
                                </p>
                            </FormItem>
                            <FormItem label="Weight">
                                <Input
                                    size="sm"
                                    type="number"
                                    placeholder="Optional shipping weight"
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value)}
                                    disabled={saving}
                                />
                            </FormItem>
                        </div>

                        <FormItem label="Variant picture">
                            <VariantImageField
                                value={imageUrl}
                                onChange={setImageUrl}
                                disabled={saving}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Shown on the storefront product page. The parent
                                product&apos;s photo is used when no picture is
                                set.
                            </p>
                        </FormItem>
                    </section>

                    {/* Material Master connection */}
                    <section className="space-y-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Material Master connection
                        </p>
                        <ProductMaterialPicker
                            productId={product.id}
                            companyId={product.company?.id ?? null}
                            value={materialId}
                            onChange={setMaterialId}
                            disabled={saving}
                            required
                        />
                    </section>
                </form>
            )}
        </FormDialog>
    )
}

export default AddVariantDialog
