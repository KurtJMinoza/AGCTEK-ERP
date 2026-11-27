'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    fiDocumentTypeService,
    ficoDocumentTypeService,
    ficoErrorMessage,
} from '../services/ficoService'
import type {
    FiDocumentType,
    FiDocumentTypeInput,
    FicoDocumentType,
} from '../types'

export function allowsManualDocumentType(
    companyType: FicoDocumentType,
    fiByCode: Map<string, FiDocumentType>,
) {
    const remark = (companyType.remarks || '').toLowerCase()
    if (remark.includes('allowsmanualentry=true')) return true
    if (remark.includes('allowsmanualentry=false')) return false
    const fi = fiByCode.get(companyType.code)
    if (fi) return Boolean(fi.isActive && fi.allowsManualEntry)
    return companyType.documentCategory === 'GENERAL_JOURNAL'
}

/** Global FI document types (journal FK master). */
export function useDocumentTypes() {
    const [data, setData] = useState<FiDocumentType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await fiDocumentTypeService.list())
        } catch (err) {
            setError(ficoErrorMessage(err, 'Failed to load document types'))
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => {
        void reload()
    }, [reload])
    return { data, loading, error, reload }
}

/**
 * Company Document Types page master + FI ids for journal create.
 * Manual-journal options: active company types that allow manual entry.
 */
export function useManualJournalDocumentTypes(companyId?: string) {
    const [companyTypes, setCompanyTypes] = useState<FicoDocumentType[]>([])
    const [fiTypes, setFiTypes] = useState<FiDocumentType[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!companyId) {
            setCompanyTypes([])
            setFiTypes([])
            setLoading(false)
            setError(null)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const [companyResult, fi] = await Promise.all([
                ficoDocumentTypeService.list({
                    companyId,
                    status: 'ACTIVE',
                    page: 1,
                    pageSize: 200,
                    sortBy: 'code',
                    sortOrder: 'asc',
                }),
                fiDocumentTypeService.list(),
            ])
            setCompanyTypes(companyResult.items)
            setFiTypes(fi)
        } catch (err) {
            setError(ficoErrorMessage(err, 'Failed to load document types'))
            setCompanyTypes([])
            setFiTypes([])
        } finally {
            setLoading(false)
        }
    }, [companyId])

    useEffect(() => {
        void reload()
    }, [reload])

    const fiByCode = useMemo(() => {
        const map = new Map<string, FiDocumentType>()
        for (const type of fiTypes) map.set(type.code, type)
        return map
    }, [fiTypes])

    const manualOptions = useMemo(
        () =>
            companyTypes
                .filter(
                    (type) =>
                        type.status === 'ACTIVE' &&
                        allowsManualDocumentType(type, fiByCode),
                )
                .map((type) => {
                    const fi = fiByCode.get(type.code)
                    return {
                        code: type.code,
                        name: type.name,
                        companyTypeId: type.id,
                        /** Journal API FK target (global FI type). */
                        documentTypeId: fi?.id ?? '',
                        label: `${type.code} — ${type.name}`,
                    }
                })
                .filter((option) => Boolean(option.documentTypeId)),
        [companyTypes, fiByCode],
    )

    return {
        companyTypes,
        fiTypes,
        manualOptions,
        loading,
        error,
        reload,
    }
}

export function useDocumentTypeMutations(
    onSuccess?: () => void | Promise<void>,
) {
    const [saving, setSaving] = useState(false)
    const mutate = async <T,>(work: () => Promise<T>) => {
        setSaving(true)
        try {
            const result = await work()
            await onSuccess?.()
            return result
        } finally {
            setSaving(false)
        }
    }
    return {
        saving,
        create: (body: FiDocumentTypeInput) =>
            mutate(() => fiDocumentTypeService.create(body)),
        update: (id: string, body: Partial<FiDocumentTypeInput>) =>
            mutate(() => fiDocumentTypeService.update(id, body)),
        deactivate: (id: string) =>
            mutate(() => fiDocumentTypeService.deactivate(id)),
    }
}
