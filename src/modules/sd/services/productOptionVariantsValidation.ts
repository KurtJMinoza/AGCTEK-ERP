import type { OptionsVariantsDraft } from './productOptionVariantsService'

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/
const MAX_OPTIONS = 10
const MAX_VARIANTS = 500

/**
 * Client-side gate for the Options & Variants step. Mirrors the backend rules
 * (option name/values, variant SKU/price/combination) so saving is blocked with
 * readable messages instead of a generic "Request failed with status code 400".
 * Returns [] when the draft is valid (or empty → simple product).
 */
export function validateOptionsVariants(
    draft: OptionsVariantsDraft | null | undefined,
): string[] {
    if (!draft) return []
    const issues: string[] = []
    const { options, variants } = draft

    if (options.length > MAX_OPTIONS) {
        issues.push(`A product can have at most ${MAX_OPTIONS} option groups`)
    }
    if (variants.length > MAX_VARIANTS) {
        issues.push(`A product can have at most ${MAX_VARIANTS} variants`)
    }

    const optionNames = new Set<string>()
    options.forEach((option, index) => {
        const name = option.name.trim()
        const label = name || `Option ${index + 1}`
        if (!name) {
            issues.push(`Option ${index + 1}: enter a name (e.g. Size, Color)`)
        } else if (optionNames.has(name)) {
            issues.push(`Duplicate option group "${name}"`)
        }
        if (name) optionNames.add(name)

        if (option.values.length === 0) {
            issues.push(
                `Option "${label}": add at least one value (comma separated)`,
            )
        }

        const seen = new Set<string>()
        option.values.forEach((entry) => {
            const trimmed = entry.value.trim()
            if (!trimmed) {
                issues.push(`Option "${label}": remove the empty value`)
                return
            }
            if (seen.has(trimmed)) {
                issues.push(`Option "${label}": duplicate value "${trimmed}"`)
            }
            seen.add(trimmed)
        })
    })

    if (options.length > 0 && variants.length === 0) {
        issues.push(
            'Generate at least one variant, or remove all options to sell the product as a single item',
        )
    }

    const skus = new Set<string>()
    const combos = new Set<string>()
    variants.forEach((variant, index) => {
        const name = variant.variantName.trim()
        const sku = variant.sku.trim()
        const label = name || sku || `Variant ${index + 1}`

        if (!name) issues.push(`Variant ${index + 1}: enter a variant name`)

        if (!sku) {
            issues.push(`Variant "${label}": enter a SKU`)
        } else if (!SKU_PATTERN.test(sku)) {
            issues.push(
                `Variant "${label}": SKU may only use letters, digits, dot, dash and underscore`,
            )
        } else if (skus.has(sku)) {
            issues.push(`Variant "${label}": duplicate SKU "${sku}"`)
        }
        if (sku) skus.add(sku)

        if (
            variant.price !== null &&
            variant.price !== undefined &&
            (!Number.isFinite(variant.price) || variant.price < 0)
        ) {
            issues.push(`Variant "${label}": enter a valid price (0 or more)`)
        }
        if (
            variant.compareAtPrice != null &&
            (!Number.isFinite(Number(variant.compareAtPrice)) ||
                Number(variant.compareAtPrice) < 0)
        ) {
            issues.push(`Variant "${label}": compare-at price must be 0 or more`)
        }

        if (options.length > 0) {
            const combo = options.map((option, optionIndex) => ({
                optionName: option.name.trim(),
                value: (variant.optionValues[optionIndex] ?? '').trim(),
            }))
            if (combo.some((entry) => !entry.value)) {
                issues.push(`Variant "${label}": pick one value for every option`)
            }
            const comboKey = combo
                .map((entry) => `${entry.optionName}::${entry.value}`)
                .join('|')
            if (combos.has(comboKey)) {
                issues.push(
                    `Variant "${label}": duplicate option combination "${variant.optionValues.join(' / ')}"`,
                )
            }
            combos.add(comboKey)
        }
    })

    return [...new Set(issues)]
}
