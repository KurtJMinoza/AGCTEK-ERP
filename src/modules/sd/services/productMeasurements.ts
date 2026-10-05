import type { MaterialCatalogReference } from './materialCatalogReferenceService'
import { productAttribute, type SdProductRecord } from './productCatalogService'

/** Storefront spec rows sourced from the linked MM material; kept in `attributes.measurements`. */
export type ProductMeasurements = {
    unit: string
    weight: string
    dimensions: string
    volume: string
}

export const EMPTY_MEASUREMENTS: ProductMeasurements = {
    unit: '',
    weight: '',
    dimensions: '',
    volume: '',
}

const MEASUREMENT_LABELS: Record<keyof ProductMeasurements, string> = {
    unit: 'Unit of measure',
    weight: 'Weight',
    dimensions: 'Dimensions (L × W × H)',
    volume: 'Volume',
}

const fmt = (n: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 4 }).format(n)

const withUnit = (value: number | null, unit: string | null) =>
    value == null ? '' : `${fmt(value)} ${unit ?? ''}`.trim()

const uomText = (code: string | null, name: string | null) => {
    if (code && name && name !== code) return `${code} (${name})`
    return code ?? name ?? ''
}

export function measurementsFromMaterial(
    material: MaterialCatalogReference,
): ProductMeasurements {
    const { uom, physical } = material
    const { length, width, height, dimensionUom } = physical
    const hasDimensions = length != null || width != null || height != null
    return {
        unit:
            uomText(uom.salesUomCode, uom.salesUomName) ||
            uomText(uom.baseUomCode, uom.baseUomName),
        weight: withUnit(physical.weight, physical.weightUom),
        dimensions: hasDimensions
            ? `${fmt(length ?? 0)} × ${fmt(width ?? 0)} × ${fmt(height ?? 0)} ${dimensionUom ?? ''}`.trim()
            : '',
        volume: withUnit(physical.volume, physical.volumeUom),
    }
}

export function productMeasurements(
    record: Pick<SdProductRecord, 'attributes'>,
): ProductMeasurements {
    const saved = productAttribute<Partial<Record<string, unknown>>>(
        record,
        'measurements',
        {},
    )
    const text = (key: keyof ProductMeasurements) =>
        typeof saved[key] === 'string' ? (saved[key] as string) : ''
    return {
        unit: text('unit'),
        weight: text('weight'),
        dimensions: text('dimensions'),
        volume: text('volume'),
    }
}

/** Non-empty measurements as label/value rows for the Specifications tab. */
export function measurementSpecs(
    measurements: ProductMeasurements,
): { label: string; value: string }[] {
    return (Object.keys(MEASUREMENT_LABELS) as (keyof ProductMeasurements)[])
        .filter((key) => measurements[key].trim() !== '')
        .map((key) => ({
            label: MEASUREMENT_LABELS[key],
            value: measurements[key].trim(),
        }))
}
