'use client'

import { useMemo } from 'react'

/** Empty `authority` means open to any signed-in user; otherwise the user needs at least one matching entry. */
function useAuthority(userAuthority: string[] = [], authority: string[] = []) {
    return useMemo(() => {
        if (authority.length === 0) {
            return true
        }

        return authority.some((role) => userAuthority.includes(role))
    }, [authority, userAuthority])
}

export default useAuthority
