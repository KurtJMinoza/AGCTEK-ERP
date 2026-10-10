import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import { toApiError as toError } from './apiError'
import type { StorefrontAvailability } from './productCatalogService'

/** Storefront control style for an option group. */
export type OptionDisplayStyle =
    | 'BUTTON'
    | 'DROPDOWN'
    | 'SWATCH'
    | 'IMAGE'
    | 'TILE'

/** Storefront: variant image replaces the main product photo. */
export type VariantImageMode = 'replace' | 'keep'

/** One option group with its values (as stored by the backend). */
export type ProductOptionDefinition = {
    id: string
    name: string
    sortOrder: number
    isRequired: boolean
    displayStyle: OptionDisplayStyle
    values: Array<{
        id: string
        value: string
        sortOrder: number
        swatchColor: string | null
        imageUrl: string
    }>
}

/** One variant with its option assignments (as stored by the backend). */
export type ProductVariantDefinition = {
    id: string
    productId: string
    variantName: string
    sku: string
    barcode: string | null
    /** Price override; null → inherit the parent product price. */
    price: number | null
    compareAtPrice: number | null
    cost: number | null
    imageUrl: string
    weight: number | null
    isActive: boolean
    isDefault: boolean
    sortOrder: number
    materialId: string | null
    companyId: string | null
    salesUomId: string | null
    materialUomId: string | null
    optionValues: Array<{
        optionId: string
        optionValueId: string
        value: string
    }>
    createdAt: string
    updatedAt: string
}

export type ProductOptionsVariants = {
    hasVariants: boolean
    variantImageMode: VariantImageMode
    options: ProductOptionDefinition[]
    variants: ProductVariantDefinition[]
}

/** Editable draft of one option value (admin editor). */
export type OptionValueDraft = {
    value: string
    swatchColor?: string | null
    imageUrl?: string
}

/** Editable draft of one option group (admin editor). */
export type OptionDraft = {
    name: string
    isRequired: boolean
    displayStyle?: OptionDisplayStyle
    values: OptionValueDraft[]
    /** UI-only raw comma text while typing (ignored by the API). */
    rawValues?: string
}

/** Editable draft of one variant row (admin generator grid). */
export type VariantDraft = {
    variantName: string
    sku: string
    barcode?: string | null
    /** Price override; null → inherit the parent product price. */
    price: number | null
    compareAtPrice?: number | null
    cost?: number | null
    imageUrl?: string
    weight?: number | null
    isActive: boolean
    /** Default preset variant (one per product). */
    isDefault?: boolean
    sortOrder?: number
    materialId?: string | null
    companyId?: string | null
    salesUomId?: string | null
    materialUomId?: string | null
    /** Display values in the same order as `options`. */
    optionValues: string[]
}

export type OptionsVariantsDraft = {
    options: OptionDraft[]
    variants: VariantDraft[]
    /** Storefront: variant image replaces the main product photo. */
    variantImageMode?: VariantImageMode
}

export type VariantStockAvailability = StorefrontAvailability & {
    variantId: string
    materialId: string | null
    companyId: string | null
}

/**
 * A variant's sellable price: its own override when set, otherwise the parent
 * product price (inheritance rule 1/2).
 */
export const effectiveVariantPrice = (
    productPrice: number,
    variant: { price: number | null } | null | undefined,
): number => (variant?.price != null ? variant.price : productPrice)

/**
 * Compare-at price: inherits the parent original price only while the variant
 * also inherits the parent price; a custom variant price drops the parent
 * discount unless the variant sets its own compare-at (inheritance rule 3).
 */
export const effectiveVariantCompareAt = (
    product: { originalPrice: number | null },
    variant:
        | { price: number | null; compareAtPrice: number | null }
        | null
        | undefined,
): number | null => {
    if (!variant) return product.originalPrice
    return variant.price === null
        ? product.originalPrice
        : variant.compareAtPrice
}

/** Variant plus its parent product (POS barcode lookup). */
export type VariantWithProduct = ProductVariantDefinition & {
    product?: {
        id: string
        divisionId: string
        sku: string
        name: string
    } | null
}

const BASE = '/sd/products'

/**
 * Backend shape: option values are `{ value }` objects, while the editable
 * draft keeps plain strings for simpler inputs. Variants already match.
 */
const toApiDraft = (draft: OptionsVariantsDraft) => ({
    options: draft.options.map((option) => ({
        name: option.name,
        isRequired: option.isRequired,
        displayStyle: option.displayStyle ?? 'BUTTON',
        values: option.values.map((value) => ({
            value: value.value,
            swatchColor: value.swatchColor ?? undefined,
            imageUrl: value.imageUrl ?? undefined,
        })),
    })),
    variants: draft.variants,
    variantImageMode: draft.variantImageMode,
})

/**
 * Upgrades drafts saved before option values became objects (older localStorage
 * autosaves sent plain strings) and stamps variant default/order.
 */
export const normalizeOptionsDraft = (
    draft: OptionsVariantsDraft,
): OptionsVariantsDraft => ({
    ...draft,
    options: draft.options.map((option) => ({
        ...option,
        values: ((option.values ?? []) as unknown[]).map((entry) =>
            typeof entry === 'string'
                ? { value: entry }
                : (entry as OptionValueDraft),
        ),
    })),
    variants: draft.variants.map((variant, index) => ({
        ...variant,
        isDefault: variant.isDefault ?? index === 0,
        sortOrder: variant.sortOrder ?? index,
    })),
})

export const productOptionVariantsService = {
    getForProduct: (productId: string) =>
        ErpAxiosBase.get<ProductOptionsVariants>(
            `${BASE}/${encodeURIComponent(productId)}/options-variants`,
        ).then((r) => r.data),

    saveForProduct: (productId: string, draft: OptionsVariantsDraft) =>
        ErpAxiosBase.put<ProductOptionsVariants>(
            `${BASE}/${encodeURIComponent(productId)}/options-variants`,
            toApiDraft(draft),
        )
            .then((r) => r.data)
            .catch((error: unknown) => {
                throw toError(error, 'Unable to save options & variants')
            }),

    findVariantByBarcode: (barcode: string) =>
        ErpAxiosBase.get<VariantWithProduct>(
            `${BASE}/variants/barcode/${encodeURIComponent(barcode)}`,
        ).then((r) => r.data),

    variantAvailability: (
        variantId: string,
        companyId?: string | null,
        branchId?: string | null,
    ) =>
        ErpAxiosBase.get<VariantStockAvailability>(
            `${BASE}/variants/${encodeURIComponent(variantId)}/availability`,
            { params: { companyId: companyId ?? undefined, branchId: branchId ?? undefined } },
        ).then((r) => r.data),

    productVariantsAvailability: (
        productId: string,
        companyId?: string | null,
        branchId?: string | null,
    ) =>
        ErpAxiosBase.get<VariantStockAvailability[]>(
            `${BASE}/${encodeURIComponent(productId)}/variants/availability`,
            { params: { companyId: companyId ?? undefined, branchId: branchId ?? undefined } },
        ).then((r) => r.data),
}