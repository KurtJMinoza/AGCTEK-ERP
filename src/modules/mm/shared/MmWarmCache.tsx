'use client'

import { useEffect } from 'react'
import { orgService } from '@/modules/mm/material-master/services/referenceService'

/**
 * Warm MM reference cache after login so the first module click
 * does not wait on companies / warehouses / currencies.
 */
export default function MmWarmCache() {
    useEffect(() => {
        void Promise.allSettled([
            orgService.companies(),
            orgService.warehouses(),
            orgService.currencies(),
            orgService.valuationClasses(),
        ])
    }, [])
    return null
}
