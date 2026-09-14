'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCancelVehicleDocument,
    apiCreateVehicleDocument,
    apiGetComplianceSummary,
    apiGetVehicleDocuments,
    apiUpdateVehicleDocument,
    type CreateVehicleDocumentBody,
} from '../services/scmApi'
import type {
    ComplianceSummary,
    ListParams,
    Paginated,
    VehicleDocument,
} from '../types'

const empty: Paginated<VehicleDocument> = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
}

export function useVehicleDocuments(
    initial?: ListParams & { kind?: string; expiring?: string },
) {
    const [params, setParams] = useState<
        ListParams & { kind?: string; expiring?: string }
    >({
        page: 1,
        pageSize: 10,
        ...initial,
    })
    const [result, setResult] = useState<Paginated<VehicleDocument>>(empty)
    const [summary, setSummary] = useState<ComplianceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [docs, compliance] = await Promise.all([
                apiGetVehicleDocuments(params),
                apiGetComplianceSummary(),
            ])
            setResult(docs)
            setSummary(compliance)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load registration & insurance',
            )
            setResult(empty)
        } finally {
            setLoading(false)
        }
    }, [params])

    useEffect(() => {
        void reload()
    }, [reload])

    const create = async (body: CreateVehicleDocumentBody) => {
        const created = await apiCreateVehicleDocument(body)
        await reload()
        return created
    }

    const update = async (
        id: string,
        body: Partial<CreateVehicleDocumentBody>,
    ) => {
        const updated = await apiUpdateVehicleDocument(id, body)
        await reload()
        return updated
    }

    const cancel = async (id: string) => {
        await apiCancelVehicleDocument(id)
        await reload()
    }

    return {
        ...result,
        summary,
        loading,
        error,
        params,
        setParams,
        reload,
        create,
        update,
        cancel,
    }
}
