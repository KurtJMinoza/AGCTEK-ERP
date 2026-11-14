import { useMemo, useState } from 'react'
import type { FilterChip, FilterField } from '@/components/shared/FilterBar'
import {
    salesChannelLabel,
    type SalesLineReportRow,
} from '../services/salesAnalyticsService'

export type SalesLineReportFilterState = {
    search: string
    channel: string
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
            filters.channel !== 'ALL' &&
            row.salesChannel !== filters.channel
        ) {
            return false
        }
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
    const [channel, setChannel] = useState('ALL')
    const [location, setLocation] = useState('ALL')
    const [salesType, setSalesType] = useState('ALL')

    const channelOptions = useMemo(() => {
        const values = [
            ...new Set(rows.map((row) => row.salesChannel).filter(Boolean)),
        ].sort((a, b) => salesChannelLabel(a).localeCompare(salesChannelLabel(b)))
        return [
            { value: 'ALL', label: 'All channels' },
            ...values.map((value) => ({ value, label: salesChannelLabel(value) })),
        ]
    }, [rows])

    const locationOptions = useMemo(() => {
        const values = [
            ...new Set(rows.map((row) => row.location).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b))
        return [
            { value: 'ALL', label: 'All locations' },
            ...values.map((value) => ({ value, label: value })),
        ]
    }, [rows])

    const state: SalesLineReportFilterState = { search, channel, location, salesType }

    const filteredRows = useMemo(
        () => filterSalesLineReport(rows, state),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, search, channel, location, salesType],
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
                key: 'channel',
                label: 'Channel',
                kind: 'select',
                value: channel,
                options: channelOptions,
                className: 'w-full sm:w-40',
                onChange: setChannel,
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
        [search, channel, location, salesType, channelOptions, locationOptions],
    )

    const chips: FilterChip[] = useMemo(() => {
        const active: FilterChip[] = []
        if (channel !== 'ALL') {
            active.push({
                key: 'channel',
                label: `Channel: ${salesChannelLabel(channel)}`,
                onRemove: () => setChannel('ALL'),
            })
        }
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
    }, [channel, location, salesType, search])

    const clearFilters = () => {
        setSearch('')
        setChannel('ALL')
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
