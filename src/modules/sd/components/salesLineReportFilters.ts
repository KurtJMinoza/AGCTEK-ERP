import { useMemo, useState } from 'react'
import type { FilterChip, FilterField } from '@/components/shared/FilterBar'
import type { SalesLineReportRow } from '../services/salesAnalyticsService'

export type SalesLineReportFilterState = {
    search: string
    location: string
    salesType: string
}

export function filterSalesLineReport(
    rows: SalesLineReportRow[],
    filters: SalesLineReportFilterState,
) {
    const q = filters.search.trim().toLowerCase()
    return rows.filter((row) => {
        if (
            filters.location !== 'ALL' &&
            row.location !== filters.location
        ) {
            return false
        }
        if (
            filters.salesType !== 'ALL' &&
            row.salesType !== filters.salesType
        ) {
            return false
        }
        if (!q) return true
        return (
            row.customerName.toLowerCase().includes(q) ||
            row.particular.toLowerCase().includes(q) ||
            row.invoiceNumber.toLowerCase().includes(q) ||
            row.barcode.toLowerCase().includes(q) ||
            row.accountTitle.toLowerCase().includes(q)
        )
    })
}

export function useSalesLineReportFilters(rows: SalesLineReportRow[]) {
    const [search, setSearch] = useState('')
    const [location, setLocation] = useState('ALL')
    const [salesType, setSalesType] = useState('ALL')

    const locationOptions = useMemo(() => {
        const values = [
            ...new Set(rows.map((row) => row.location).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b))
        return [
            { value: 'ALL', label: 'All locations' },
            ...values.map((value) => ({ value, label: value })),
        ]
    }, [rows])

    const state: SalesLineReportFilterState = { search, location, salesType }

    const filteredRows = useMemo(
        () => filterSalesLineReport(rows, state),
        [rows, search, location, salesType],
    )

    const fields: FilterField[] = useMemo(
        () => [
            {
                key: 'search',
                label: 'Search',
                kind: 'text',
                inputType: 'search',
                value: search,
                placeholder: 'Customer, product, barcode, invoice…',
                silent: true,
                className: 'min-w-[12rem] flex-1',
                onChange: setSearch,
            },
            {
                key: 'location',
                label: 'Location',
                kind: 'select',
                value: location,
                options: locationOptions,
                className: 'w-full sm:w-40',
                onChange: setLocation,
            },
            {
                key: 'salesType',
                label: 'Sales type',
                kind: 'select',
                value: salesType,
                options: [
                    { value: 'ALL', label: 'All sales types' },
                    { value: 'CASH', label: 'Cash' },
                    { value: 'CREDIT', label: 'Credit' },
                ],
                className: 'w-full sm:w-36',
                onChange: setSalesType,
            },
        ],
        [search, location, salesType, locationOptions],
    )

    const chips: FilterChip[] = useMemo(() => {
        const active: FilterChip[] = []
        if (location !== 'ALL') {
            active.push({
                key: 'location',
                label: `Location: ${location}`,
                onRemove: () => setLocation('ALL'),
            })
        }
        if (salesType !== 'ALL') {
            active.push({
                key: 'salesType',
                label: `Sales type: ${salesType}`,
                onRemove: () => setSalesType('ALL'),
            })
        }
        if (search.trim()) {
            active.push({
                key: 'search',
                label: `Search: ${search.trim()}`,
                onRemove: () => setSearch(''),
            })
        }
        return active
    }, [location, salesType, search])

    const clearFilters = () => {
        setSearch('')
        setLocation('ALL')
        setSalesType('ALL')
    }

    return {
        filteredRows,
        fields,
        chips,
        clearFilters,
        hasActiveFilters: chips.length > 0,
    }
}
