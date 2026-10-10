/**
 * Selling branch shown on POS / sales orders. Branches are created in
 * Materials Management → Organization → Branches ("Store this terminal is
 * operating in") and loaded live — SDK keeps only the shared shape here.
 */
export type SalesBranch = {
    id: string
    label: string
    code?: string
    companyName?: string | null
}

/** Human label for a stored order branch id (name when known, else the id). */
export const branchLabel = (
    branchId: string | null | undefined,
    fallbackName?: string | null,
) => (branchId ? fallbackName?.trim() || branchId : '—')
