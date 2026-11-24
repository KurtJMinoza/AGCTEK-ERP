'use client'

import useResourceAccess from '@/utils/hooks/useResourceAccess'

/**
 * Batch/lot actions from a material SKU detail page use `materials-skus` in the URL,
 * but the API is guarded by `mm.material-master.batches`. Allow either batches create
 * or SKU update so operators aren't blocked on the wrong permission resource.
 */
export function useBatchAccess() {
    const batches = useResourceAccess('mm.material-master.batches')
    const skus = useResourceAccess('mm.material-master.materials-skus')
    return {
        loading: batches.loading || skus.loading,
        canCreate: batches.canCreate || skus.canUpdate,
        canUpdate: batches.canUpdate || skus.canUpdate,
        canDelete: batches.canDelete || skus.canUpdate,
    }
}