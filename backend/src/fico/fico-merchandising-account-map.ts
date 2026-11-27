/**
 * AWIC merchandising category → revenue / COGS / inventory G/L codes (per company COA).
 * SD (SALES_REVENUE) and MM (GI_COGS, SALES_RETURN) resolve from the same category keys
 * when valuation class is unset — use material category code as materialGroupCode.
 */
export type MerchandisingGlTriplet = {
    revenue: string
    cogs: string
    inventory: string
}

export const AWIC_MERCHANDISING_GL: Record<string, MerchandisingGlTriplet> = {
    CAPS: { revenue: '4011', cogs: '5011', inventory: '1311' },
    HATS: { revenue: '4009', cogs: '5009', inventory: '1309' },
    SHIRTS: { revenue: '4009', cogs: '5009', inventory: '1309' },
    APPAREL: { revenue: '4009', cogs: '5009', inventory: '1309' },
    ACCESSORIES: { revenue: '4009', cogs: '5009', inventory: '1309' },
    WATCHES: { revenue: '4001', cogs: '5001', inventory: '1301' },
    WATCH: { revenue: '4001', cogs: '5001', inventory: '1301' },
    BAGS: { revenue: '4006', cogs: '5006', inventory: '1306' },
    LUXURY_BAGS: { revenue: '4002', cogs: '5002', inventory: '1302' },
    PERFUME: { revenue: '4008', cogs: '5008', inventory: '1308' },
    PERFUMES: { revenue: '4008', cogs: '5008', inventory: '1308' },
    FRAGRANCE: { revenue: '4008', cogs: '5008', inventory: '1308' },
    FOOD: { revenue: '4004', cogs: '5004', inventory: '1304' },
    SUPPLEMENT: { revenue: '4004', cogs: '5004', inventory: '1304' },
    SUPPLEMENTS: { revenue: '4004', cogs: '5004', inventory: '1304' },
    VITAMINS: { revenue: '4004', cogs: '5004', inventory: '1304' },
    CONSUMABLES: { revenue: '4004', cogs: '5004', inventory: '1304' },
    SLIMMING: { revenue: '4003', cogs: '5003', inventory: '1303' },
    SPEAKER: { revenue: '4007', cogs: '5007', inventory: '1307' },
    SPEAKERS: { revenue: '4007', cogs: '5007', inventory: '1307' },
}

export function merchandisingGlCodesForCategory(
    materialCategoryCode: string | null | undefined,
): MerchandisingGlTriplet | null {
    const code = materialCategoryCode?.trim().toUpperCase()
    if (!code) return null
    if (AWIC_MERCHANDISING_GL[code]) {
        return AWIC_MERCHANDISING_GL[code]
    }
    for (const [key, triplet] of Object.entries(AWIC_MERCHANDISING_GL)) {
        if (code.includes(key)) return triplet
    }
    return null
}

export const AWIC_CATEGORY_REVENUE_GL: Record<string, string> = Object.fromEntries(
    Object.entries(AWIC_MERCHANDISING_GL).map(([k, v]) => [k, v.revenue]),
)