'use client'

import CloseButton from '@/components/ui/CloseButton'
import Tag from '@/components/ui/Tag'

export type ActiveFilter = { key: string; label: string }

type ActiveFiltersProps = {
    filters: ActiveFilter[]
    onRemove: (key: string) => void
}

/** Removable chips for deep-link filters (e.g. from the CRM dashboard) without their own control. */
export default function ActiveFilters({ filters, onRemove }: ActiveFiltersProps) {
    if (filters.length === 0) return null
    return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Filtered by</span>
            {filters.map((filter) => (
                <Tag
                    key={filter.key}
                    suffix={
                        <CloseButton
                            className="ml-1 text-xs"
                            aria-label={`Remove filter: ${filter.label}`}
                            onClick={() => onRemove(filter.key)}
                        />
                    }
                >
                    {filter.label}
                </Tag>
            ))}
        </div>
    )
}
