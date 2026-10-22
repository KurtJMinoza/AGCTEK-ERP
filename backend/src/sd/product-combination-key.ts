/**
 * Variant combination keys.
 *
 * A product's variants are identified by their option combination, e.g.
 * "color:black|size:medium". The key is unique per product.
 *
 * A product WITHOUT customer-selectable options still needs a unique key per
 * variant — otherwise every variant of that product would share one key and
 * the second variant would be rejected as a duplicate of the first. For those
 * products the variant is identified by the material it links, because a
 * material may back only one active variant.
 */

/** Key used by a product that has no options and no material-linked variant. */
export const DEFAULT_COMBINATION_KEY = '__default__'

/** Combination key for a product WITHOUT customer-selectable options. */
export const materialCombinationKey = (
    materialId?: string | null,
): string =>
    materialId ? `material:${materialId}` : DEFAULT_COMBINATION_KEY

/**
 * Combination key for a product WITH options, e.g.
 * "color:black|size:medium". The option order follows the product's option
 * sort order.
 */
export const optionCombinationKey = (
    options: Array<{ name: string }>,
    optionValues: string[],
): string => {
    if (options.length === 0) return DEFAULT_COMBINATION_KEY
    return options
        .map((option, index) => {
            const name = option.name.trim().toLowerCase()
            const value = (optionValues[index] ?? '').trim().toLowerCase()
            return `${name}:${value}`
        })
        .join('|')
}

/**
 * The key for a variant, whatever the product looks like.
 *
 * @param options     the product's option groups (empty = no options)
 * @param optionValues the selected option values
 * @param materialId  the material the variant links
 * @param sku         the variant's sellable SKU (unique per product)
 */
export const variantCombinationKey = (
    options: Array<{ name: string }>,
    optionValues: string[],
    materialId?: string | null,
    sku?: string | null,
): string => {
    if (options.length > 0) {
        return optionCombinationKey(options, optionValues)
    }
    if (materialId) return materialCombinationKey(materialId)
    // No options and no material: fall back to the SKU, which is unique per
    // product, so two such variants still get two different keys.
    const trimmed = sku?.trim()
    return trimmed ? `sku:${trimmed}` : DEFAULT_COMBINATION_KEY
}

/**
 * A readable name for a combination, used in conflict messages. Never empty —
 * a product without options still needs a sentence the user can act on.
 */
export const humanCombination = (optionValues?: string[] | null): string => {
    const text = (optionValues ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' / ')
    return text || 'This variant'
}
