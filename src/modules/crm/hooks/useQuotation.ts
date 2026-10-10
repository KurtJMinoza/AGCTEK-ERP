'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { getQuotation, type Quotation } from '@/modules/sd/services/quotationService'

/** One SD quotation for the quotation page; no client cache, callers reload after changes. */
export function useQuotation(id: string | null | undefined) {
    const [quotation, setQuotation] = useState<Quotation | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)

    const reload = useCallback(async () => {
        if (!id) return
        setLoading(true)
        setError(null)
        setNotFound(false)
        try {
            setQuotation(await getQuotation(id))
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true)
            else setError(getApiErrorMessage(err, 'Failed to load quotation'))
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        setQuotation(null)
        setNotFound(false)
        void reload()
    }, [reload])

    return { quotation, loading, error, notFound, reload }
}