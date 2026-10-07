import { productDivisionLabel } from '@/modules/sd/catalogs/productDivisions'
import type { SdProductRecord } from '@/modules/sd/services/productCatalogService'
import { OFFICIAL_STORES } from './components/MarketplaceOfficialStores'
import { productKey } from './marketplaceUi'

type IndexedField = { text: string; weight: number; words: string[] }

/** Everyday shopper words → terms used in the catalogue. */
const SYNONYMS: Record<string, string[]> = {
    tank: ['lpg', 'refill', 'cylinder'],
    tangke: ['lpg', 'refill', 'cylinder'],
    gasul: ['lpg'],
    gas: ['lpg'],
    cylinder: ['lpg', 'refill'],
    fridge: ['refrigerator'],
    ref: ['refrigerator'],
    washer: ['washing'],
    labahan: ['washing', 'laundry'],
    oven: ['microwave'],
    kalan: ['stove', 'burner', 'powerkalan'],
    vitamin: ['multivitamin'],
    vit: ['vitamin'],
    supplement: ['vitamin', 'omega', 'collagen'],
    shade: ['sunglasses'],
    tumbler: ['bottle'],
    notebook: ['journal'],
}

/** Edits allowed for a typo match; short words must match exactly. */
const typoBudget = (length: number) => (length >= 8 ? 2 : length >= 5 ? 1 : 0)

const withinEdits = (a: string, b: string, max: number) => {
    if (Math.abs(a.length - b.length) > max) return false
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        const row = [i]
        let rowMin = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
            rowMin = Math.min(rowMin, row[j])
        }
        if (rowMin > max) return false
        prev = row
    }
    return prev[b.length] <= max
}

type IndexedProduct = {
    key: string
    name: string
    sku: string
    fields: IndexedField[]
}

export type MarketplaceSearchIndex = IndexedProduct[]

/** Lowercase, accent-free, punctuation collapsed to single spaces. */
export const normalizeSearchText = (value: string) =>
    value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

/** "tanks" also finds "tank"; short words are left alone. */
const stem = (token: string) =>
    token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token

const collectText = (value: unknown, out: string[], depth = 0) => {
    if (value == null || depth > 3) return
    if (typeof value === 'string' || typeof value === 'number') {
        out.push(String(value))
    } else if (Array.isArray(value)) {
        for (const item of value) collectText(item, out, depth + 1)
    } else if (typeof value === 'object') {
        for (const item of Object.values(value))
            collectText(item, out, depth + 1)
    }
}

const storeText = (product: SdProductRecord) => {
    const store = OFFICIAL_STORES.find(
        (s) => s.divisionId === product.divisionId,
    )
    return [
        product.company?.name,
        product.company?.code,
        productDivisionLabel(product.divisionId),
        store?.name,
        store?.tagline,
    ]
        .filter(Boolean)
        .join(' ')
}

export const buildSearchIndex = (
    records: readonly SdProductRecord[],
): MarketplaceSearchIndex =>
    records.map((product) => {
        const attributes: string[] = []
        collectText(product.attributes, attributes)
        const name = normalizeSearchText(product.name)
        const sku = normalizeSearchText(product.sku)
        return {
            key: productKey(product),
            name,
            sku,
            fields: [
                { text: name, weight: 10 },
                { text: sku, weight: 8 },
                {
                    text: normalizeSearchText(storeText(product)),
                    weight: 5,
                },
                { text: normalizeSearchText(product.category), weight: 5 },
                { text: normalizeSearchText(product.badge ?? ''), weight: 3 },
                { text: normalizeSearchText(product.description), weight: 2 },
                { text: normalizeSearchText(attributes.join(' ')), weight: 1 },
            ]
                .filter((field) => field.text)
                .map((field) => ({ ...field, words: field.text.split(' ') })),
        }
    })

/** Best score for one query word in one product: exact/prefix > synonym > typo. */
const scoreToken = (product: IndexedProduct, token: string) => {
    let best = 0
    const candidates: [string, number][] = [
        [token, 1],
        ...(SYNONYMS[token] ?? []).map((term): [string, number] => [term, 0.8]),
    ]
    for (const field of product.fields) {
        for (const [term, factor] of candidates) {
            const at = field.text.indexOf(term)
            if (at === -1) continue
            const wordStart = at === 0 || field.text[at - 1] === ' '
            best = Math.max(best, field.weight * (wordStart ? 2 : 1) * factor)
        }
    }
    if (best > 0) return best

    const budget = typoBudget(token.length)
    if (budget === 0) return 0
    for (const field of product.fields) {
        if (field.weight < 5) continue
        if (field.words.some((word) => withinEdits(token, word, budget))) {
            best = Math.max(best, field.weight * 0.5)
        }
    }
    return best
}

/**
 * Every query word must appear somewhere in the product (in any order).
 * Returns a relevance score per matching product key; non-matches are omitted.
 */
export const searchProducts = (
    index: MarketplaceSearchIndex,
    query: string,
): Map<string, number> => {
    const phrase = normalizeSearchText(query)
    const tokens = [...new Set(phrase.split(' ').filter(Boolean).map(stem))]
    const scores = new Map<string, number>()
    if (tokens.length === 0) return scores

    for (const product of index) {
        let score = 0
        let matchedAll = true
        for (const token of tokens) {
            const best = scoreToken(product, token)
            if (best === 0) {
                matchedAll = false
                break
            }
            score += best
        }
        if (!matchedAll) continue
        if (product.sku === phrase) score += 100
        if (product.name.startsWith(phrase)) score += 50
        else if (product.name.includes(phrase)) score += 25
        scores.set(product.key, score)
    }
    return scores
}
