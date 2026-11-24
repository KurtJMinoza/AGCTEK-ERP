'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    fiDocumentTypeService,
    ficoErrorMessage,
} from '../services/ficoService'
import type { FiDocumentType, FiDocumentTypeInput } from '../types'

export function useDocumentTypes() {
    const [data, setData] = useState<FiDocumentType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await fiDocumentTypeService.list())
        } catch (error) {
            setError(ficoErrorMessage(error, 'Failed to load document types'))
        } finally {
            setLoading(false)
        }
    }, [])
    useEffect(() => void reload(), [reload])
    return { data, loading, error, reload }
}

export function useDocumentTypeMutations(onSuccess?: () => void | Promise<void>) {
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
