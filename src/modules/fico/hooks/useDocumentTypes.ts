'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    ficoDocumentTypeService,
    ficoErrorMessage,
} from '../services/ficoService'
import type { FicoDocumentType, FicoDocumentTypeInput } from '../types'

export function useDocumentTypes() {
    const [data, setData] = useState<FicoDocumentType[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await ficoDocumentTypeService.list())
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
        create: (body: FicoDocumentTypeInput) =>
            mutate(() => ficoDocumentTypeService.create(body)),
        update: (id: string, body: Partial<FicoDocumentTypeInput>) =>
            mutate(() => ficoDocumentTypeService.update(id, body)),
        deactivate: (id: string) =>
            mutate(() => ficoDocumentTypeService.deactivate(id)),
    }
}
