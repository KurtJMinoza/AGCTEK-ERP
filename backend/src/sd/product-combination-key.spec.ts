/**
 * A product's variants are identified by their option combination. A product
 * WITHOUT customer-selectable options still needs a unique key per variant —
 * otherwise the second variant collides with the first and is rejected as a
 * duplicate that does not exist.
 */
import {
    DEFAULT_COMBINATION_KEY,
    humanCombination,
    materialCombinationKey,
    optionCombinationKey,
    variantCombinationKey,
} from './product-combination-key'

describe('product combination keys', () => {
    const options = [{ name: 'Color' }, { name: 'Size' }]

    it('builds the option combination for a product with options', () => {
        expect(optionCombinationKey(options, ['Black', 'Medium'])).toBe(
            'color:black|size:medium',
        )
    })

    it('normalizes case and spacing', () => {
        expect(optionCombinationKey(options, [' BLACK ', 'Medium'])).toBe(
            'color:black|size:medium',
        )
    })

    it('keys a variant without options by its material', () => {
        expect(materialCombinationKey('mat-1')).toBe('material:mat-1')
    })

    it('falls back to the default key when there is no material', () => {
        expect(materialCombinationKey(null)).toBe(DEFAULT_COMBINATION_KEY)
        expect(materialCombinationKey(undefined)).toBe(DEFAULT_COMBINATION_KEY)
    })

    it('gives two materials of the same product two different keys', () => {
        const a = variantCombinationKey([], [], 'mat-1')
        const b = variantCombinationKey([], [], 'mat-2')
        expect(a).not.toBe(b)
    })

    it('keeps the option combination when the product has options', () => {
        expect(
            variantCombinationKey(options, ['Black', 'Medium'], 'mat-1'),
        ).toBe('color:black|size:medium')
    })

    it('falls back to the SKU when there is neither an option nor a material', () => {
        expect(variantCombinationKey([], [], null, 'TEE-DEFAULT')).toBe(
            'sku:TEE-DEFAULT',
        )
    })

    it('gives two material-less variants two different keys', () => {
        const a = variantCombinationKey([], [], null, 'TEE-A')
        const b = variantCombinationKey([], [], null, 'TEE-B')
        expect(a).not.toBe(b)
    })

    it('never produces an empty human combination', () => {
        expect(humanCombination([])).toBe('This variant')
        expect(humanCombination(['', '  '])).toBe('This variant')
        expect(humanCombination(['Black', 'Medium'])).toBe('Black / Medium')
    })
})
