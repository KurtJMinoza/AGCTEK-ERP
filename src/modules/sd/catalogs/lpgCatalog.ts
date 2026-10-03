export const LPG_DIVISION_ID = 'DIV_LPG' as const

export const LPG_CATEGORIES = ['Refill', 'Brand-New', 'Add-on'] as const

export type LpgProductCategory = (typeof LPG_CATEGORIES)[number]

/** Add-ons (e.g. hose, regulator) are sold only together with an LPG refill or set. */
export const isLpgAddon = (product: { category: string }) =>
    product.category === 'Add-on'
