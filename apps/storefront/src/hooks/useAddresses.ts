import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi } from '../api/client'
import type { SavedAddress, SavedAddressInput } from '../types'

type UseAddressesResult = {
    addresses: SavedAddress[]
    defaultAddress: SavedAddress | null
    loading: boolean
    error: string | null
    refresh: () => Promise<void>
    createAddress: (input: SavedAddressInput) => Promise<SavedAddress>
    updateAddress: (id: string, input: Partial<SavedAddressInput>) => Promise<SavedAddress>
    deleteAddress: (id: string) => Promise<void>
    setDefaultAddress: (id: string) => Promise<void>
}

export function useAddresses(signedIn: boolean): UseAddressesResult {
    const [addresses, setAddresses] = useState<SavedAddress[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
    }, [])

    const refresh = useCallback(async () => {
        if (!signedIn) return
        setLoading(true)
        setError(null)
        try {
            const items = await commerceApi.getAddresses()
            if (mounted.current) setAddresses(items)
        } catch (err) {
            if (mounted.current) setError(err instanceof Error ? err.message : 'Failed to load addresses')
        } finally {
            if (mounted.current) setLoading(false)
        }
    }, [signedIn])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const createAddress = useCallback(async (input: SavedAddressInput) => {
        const addr = await commerceApi.createAddress(input)
        setAddresses((prev) => {
            const updated = input.isDefault
                ? prev.map((a) => ({ ...a, isDefault: false }))
                : [...prev]
            return [...updated, addr]
        })
        return addr
    }, [])

    const updateAddress = useCallback(async (id: string, input: Partial<SavedAddressInput>) => {
        const addr = await commerceApi.updateAddress(id, input)
        setAddresses((prev) =>
            prev.map((a) => {
                if (input.isDefault && a.id !== id) return { ...a, isDefault: false }
                if (a.id === id) return addr
                return a
            }),
        )
        return addr
    }, [])

    const deleteAddress = useCallback(async (id: string) => {
        await commerceApi.deleteAddress(id)
        setAddresses((prev) => prev.filter((a) => a.id !== id))
    }, [])

    const setDefaultAddress = useCallback(async (id: string) => {
        await commerceApi.setDefaultAddress(id)
        setAddresses((prev) =>
            prev.map((a) => ({ ...a, isDefault: a.id === id })),
        )
    }, [])

    const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null

    return {
        addresses,
        defaultAddress,
        loading,
        error,
        refresh,
        createAddress,
        updateAddress,
        deleteAddress,
        setDefaultAddress,
    }
}
