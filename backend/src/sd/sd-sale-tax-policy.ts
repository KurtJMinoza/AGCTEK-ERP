/** How a sales channel applies MM material tax on outbound sales. */
export const SD_SALE_TAX_POLICIES = [
    'FOLLOW_MATERIAL',
    'NON_VAT_OUTPUT',
] as const

export type SdSaleTaxPolicy = (typeof SD_SALE_TAX_POLICIES)[number]

export function isSdSaleTaxPolicy(value: string | null | undefined): value is SdSaleTaxPolicy {
    return SD_SALE_TAX_POLICIES.includes(value as SdSaleTaxPolicy)
}

export function saleTaxPolicyLabel(policy: SdSaleTaxPolicy): string {
    switch (policy) {
        case 'NON_VAT_OUTPUT':
            return 'Non-VAT sale (ignore material tax on this channel)'
        case 'FOLLOW_MATERIAL':
        default:
            return 'Follow material master tax'
    }
}