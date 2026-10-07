'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    getCustomers,
    type Customer,
    type CustomerListParams,
} from '@/modules/sd/services/customerMasterService'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

/** Customer master is SD-owned; CRM reads it through SD's canonical list API. */
export function useCrmCustomers(initial: CustomerListParams = {}) {
    const [params, setParams] = useState<CustomerListParams>(initial)
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setCustomers(await getCustomers(params))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load customers'))
            setCustomers([])
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    return { customers, loading, error, params, setParams, reload }
}
