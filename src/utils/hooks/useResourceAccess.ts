'use client'

import { usePathname } from 'next/navigation'
import { permissionCodeForPath } from '@/configs/erp-modules'
import usePermissions from '@/utils/hooks/usePermissions'

/**
 * CRUD flags for one permission resource, defaulting to the resource of the current page
 * (e.g. `mm.procurement.rfqs` on `/modules/mm/procurement/rfqs/...`). Flags stay false while loading.
 * For hiding actions only; the backend enforces the same permissions.
 */
function useResourceAccess(resource?: string) {
    const pathname = usePathname()
    const { can, loading } = usePermissions()
    const code = resource ?? permissionCodeForPath(pathname ?? '')

    return {
        resource: code,
        loading,
        canRead: code ? can(code, 'read') : false,
        canCreate: code ? can(code, 'create') : false,
        canUpdate: code ? can(code, 'update') : false,
        canDelete: code ? can(code, 'delete') : false,
    }
}

export default useResourceAccess
