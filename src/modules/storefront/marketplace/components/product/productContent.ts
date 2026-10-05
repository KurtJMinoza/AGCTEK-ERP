import { isRenderableImageSrc } from '@/utils/productImage'
import {
    productAttribute,
    productImageGallery,
    productVideos,
    type SdProductRecord,
} from '@/modules/sd/services/productCatalogService'
import {
    measurementSpecs,
    productMeasurements,
} from '@/modules/sd/services/productMeasurements'

export type Spec = { label: string; value: string }
export type Review = {
    id: string
    title?: string
    body?: string
    author?: string
    date?: string
    rating: number
}
export type Media = { kind: 'image' | 'video'; src: string }

/** Non-empty strings from one or more list attributes (e.g. features + keyFeatures). */
export const productStrings = (product: SdProductRecord, keys: string[]) =>
    keys
        .flatMap((key) => productAttribute<unknown>(product, key, []))
        .filter(
            (value): value is string =>
                typeof value === 'string' && value.trim() !== '',
        )

export const productSpecs = (product: SdProductRecord): Spec[] => {
    const specs = productAttribute<unknown[]>(product, 'specs', []).filter(
        (spec): spec is Spec =>
            typeof spec === 'object' &&
            spec !== null &&
            typeof (spec as Spec).label === 'string' &&
            (spec as Spec).value !== undefined,
    )
    const brand = productAttribute<string | null>(product, 'brand', null)
    const weightKg = productAttribute<number | null>(product, 'weightKg', null)
    const warranty = productAttribute<string | null>(product, 'warranty', null)
    return [
        ...(brand ? [{ label: 'Brand', value: brand }] : []),
        ...specs.map((spec) => ({
            label: spec.label,
            value: String(spec.value),
        })),
        ...(weightKg !== null
            ? [{ label: 'LPG content', value: `${weightKg} kg` }]
            : []),
        ...measurementSpecs(productMeasurements(product)),
        { label: 'Category', value: product.category },
        { label: 'SKU', value: product.sku },
        ...(warranty ? [{ label: 'Warranty', value: warranty }] : []),
    ]
}

export const productReviews = (product: SdProductRecord): Review[] =>
    productAttribute<unknown[]>(product, 'reviews', []).filter(
        (review): review is Review =>
            typeof review === 'object' &&
            review !== null &&
            typeof (review as Review).rating === 'number',
    )

/** Front photo first, then the other photos, then product videos. */
export const productMedia = (product: SdProductRecord): Media[] => [
    ...productImageGallery(product)
        .filter((src) => isRenderableImageSrc(src))
        .map((src) => ({ kind: 'image' as const, src })),
    ...productVideos(product).map((src) => ({ kind: 'video' as const, src })),
]

export const formatReviewDate = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('en-PH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
}
