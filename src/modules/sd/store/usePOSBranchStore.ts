import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SalesBranch } from '../catalogs/branchCatalog'

export const POS_GATEWAY_PATH = '/modules/sd/pos'
export const POS_TERMINAL_PATH = '/modules/sd/pos/terminal'

type POSBranchState = {
    branchId: string | null
    branchName: string | null
    selectBranch: (branch: SalesBranch) => void
    clearBranch: () => void
}

/** The branch this POS device is selling for; picked on the gateway, kept per device. */
export const usePOSBranchStore = create<POSBranchState>()(
    persist(
        (set) => ({
            branchId: null,
            branchName: null,
            selectBranch: (branch) =>
                set({ branchId: branch.id, branchName: branch.label }),
            clearBranch: () => set({ branchId: null, branchName: null }),
        }),
        {
            name: 'sd-pos-terminal-branch',
            storage: createJSONStorage(() => localStorage),
            partialize: ({ branchId, branchName }) => ({ branchId, branchName }),
        },
    ),
)

/**
 * Active branch once storage has been read (`hydrated`). The stored branch is
 * a real MM Organization Branch; the live list is loaded by `useSalesBranches`.
 */
export function useActivePOSBranch() {
    const branchId = usePOSBranchStore((s) => s.branchId)
    const branchName = usePOSBranchStore((s) => s.branchName)
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        const unsubscribe = usePOSBranchStore.persist.onFinishHydration(() =>
            setHydrated(true),
        )
        if (usePOSBranchStore.persist.hasHydrated()) setHydrated(true)
        return unsubscribe
    }, [])

    const branch = branchId
        ? ({ id: branchId, label: branchName ?? branchId } satisfies SalesBranch)
        : null
    return { hydrated, branch }
}
