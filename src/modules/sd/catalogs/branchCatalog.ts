/**
 * Selling branches / store locations used to tag sales orders. Codes must stay
 * in sync with `RETAIL_BRANCH_IDS` in `backend/src/sd/dto/sales-order.dto.ts`.
 */
export type SalesBranch = {
    id: string
    label: string
    divisionId: string
}

export const SALES_BRANCHES: readonly SalesBranch[] = [
    { id: 'BR_AWIC_DAVAO_MAIN', label: 'AWIC - Davao Main', divisionId: 'DIV_RETAIL' },
    { id: 'BR_MCONPINCO_01', label: 'MCONPINCO - Branch 1', divisionId: 'DIV_APPLIANCES' },
    { id: 'BR_LPG_01', label: 'LPG - Store 1', divisionId: 'DIV_LPG' },
]

export const branchLabel = (branchId: string | null | undefined) =>
    branchId ? (SALES_BRANCHES.find((b) => b.id === branchId)?.label ?? branchId) : '—'

/** Default selling location for the retail POS terminal (no branch picker in UI). */
export const POS_RETAIL_BRANCH_ID =
    SALES_BRANCHES.find((b) => b.divisionId === 'DIV_RETAIL')?.id ?? 'BR_AWIC_DAVAO_MAIN'
