'use client'

import { useEffect, useMemo, useState } from 'react'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tag from '@/components/ui/Tag'
import { ficoSettingsService } from '../services/ficoService'
import type { FicoCompanySettingsRow } from '../types'

const STORAGE_KEY = 'fico.selectedCompanyId'

export function useFicoCompanies() {
    const [rows, setRows] = useState<FicoCompanySettingsRow[]>([])
    const [companyId, setCompanyIdState] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ficoSettingsService
            .listCompanies()
            .catch((err: unknown) => {
                const status = (err as { response?: { status?: number } })?.response?.status
                if (status !== 403) throw err
                // Without company-settings access, still offer the user's companies.
                return ficoSettingsService.listAccessibleCompanies().then((list) =>
                    list.map((company) => ({
                        company,
                        settings: null,
                        status: 'UNKNOWN',
                    })),
                )
            })
            .then((items) => {
                if (cancelled) return
                setRows(items)
                const stored =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(STORAGE_KEY)
                        : null
                const initial =
                    items.find((item) => item.company.id === stored)?.company.id ??
                    items[0]?.company.id ??
                    ''
                setCompanyIdState(initial)
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Unable to load companies.',
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const setCompanyId = (value: string) => {
        setCompanyIdState(value)
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, value)
        }
    }

    const companies = useMemo(
        () => rows.map((row) => row.company),
        [rows],
    )
    const selectedRow = rows.find((row) => row.company.id === companyId)

    return {
        rows,
        companies,
        companyId,
        setCompanyId,
        selectedRow,
        loading,
        error,
        reload: () =>
            ficoSettingsService.listCompanies().then((items) => {
                setRows(items)
                return items
            }),
    }
}

type FicoCompanySelectProps = {
    companies: Array<{ id: string; code: string; name: string }>
    value: string
    onChange: (value: string) => void
    loading?: boolean
    className?: string
}

export function FicoCompanySelect({
    companies,
    value,
    onChange,
    loading,
    className,
}: FicoCompanySelectProps) {
    const options = companies.map((company) => ({
        value: company.id,
        label: `${company.code} — ${company.name}`,
    }))
    return (
        <div className={className ?? 'w-full sm:w-80'}>
            <Select
                isClearable={false}
                isLoading={loading}
                options={options}
                value={options.find((option) => option.value === value) ?? null}
                onChange={(option) =>
                    onChange(
                        (option as { value: string } | null)?.value ?? '',
                    )
                }
                placeholder="Select company"
            />
        </div>
    )
}

export function statusTag(status: string | undefined | null) {
    const value = (status ?? 'UNKNOWN').toUpperCase()
    const tone: Record<string, string> = {
        ACTIVE: 'bg-emerald-100 text-emerald-700',
        OPEN: 'bg-emerald-100 text-emerald-700',
        POSTED: 'bg-emerald-100 text-emerald-700',
        DRAFT: 'bg-amber-100 text-amber-700',
        FUTURE: 'bg-blue-100 text-blue-700',
        RESTRICTED: 'bg-amber-100 text-amber-700',
        CLOSED: 'bg-gray-200 text-gray-700',
        LOCKED: 'bg-red-100 text-red-700',
        INACTIVE: 'bg-red-100 text-red-700',
        NOT_CONFIGURED: 'bg-gray-200 text-gray-600',
    }
    return (
        <Tag className={`border-0 text-xs ${tone[value] ?? 'bg-gray-100 text-gray-700'}`}>
            {value}
        </Tag>
    )
}

export function notifyError(error: unknown, fallback: string) {
    const response = (
        error as {
            response?: { data?: { message?: string | string[] } }
        }
    )?.response?.data?.message
    const message = Array.isArray(response) ? response.join(', ') : response
    toast.push(
        <Notification
            type="danger"
            title="Action failed"
            closable
            duration={5000}
        >
            {message || fallback}
        </Notification>,
        { placement: 'top-end' },
    )
}

export function notifySuccess(message: string) {
    toast.push(
        <Notification type="success" title="Saved" closable duration={3500}>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )
}
