'use client'

import { useEffect, useState } from 'react'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type { MmBranch } from '@/modules/mm/material-master/types'
import type { SalesBranch } from '../catalogs/branchCatalog'

/** Maps a MM Organization Branch to the POS/SD selling-branch shape. */
export const toSalesBranch = (branch: MmBranch): SalesBranch => ({
    id: branch.id,
    label: branch.name,
    code: branch.code,
    companyName: branch.company?.name ?? null,
    companyId: branch.companyId,
    companyLogoUrl: branch.company?.logoUrl ?? null,
})

export type UseSalesBranchesOptions = {
    /**
     * When true (default), only branches for the signed-in user's assigned
     * companies are returned. Admins/super_admins still see org-wide.
     */
    scoped?: boolean
}

/**
 * Active branches from the MM Organization Branch master (created per company).
 * POS terminal + sales orders use membership-scoped results by default.
 */
export function useSalesBranches(options?: UseSalesBranchesOptions) {
    const scoped = options?.scoped !== false
    const [branches, setBranches] = useState<SalesBranch[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        setLoading(true)
        orgService
            .branches({ activeOnly: true, scoped })
            .then((rows: MmBranch[]) => {
                if (!alive) return
                setBranches(rows.map(toSalesBranch))
                setError(null)
            })
            .catch((err: unknown) => {
                if (!alive) return
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Unable to load branches',
                )
            })
            .finally(() => {
                if (alive) setLoading(false)
            })
        return () => {
            alive = false
        }
    }, [scoped])

    return { branches, loading, error }
}
