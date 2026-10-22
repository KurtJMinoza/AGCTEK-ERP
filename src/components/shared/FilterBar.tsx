'use client'

import type { ReactNode } from 'react'
import classNames from '@/utils/classNames'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { HiOutlineX } from 'react-icons/hi'

export type FilterOption = { value: string; label: string }

export type FilterField = {
    /** Stable key — also used for the chip identity. */
    key: string
    label: string
    kind?: 'select' | 'text'
    /** HTML input type for a text field (e.g. 'date'). */
    inputType?: 'text' | 'date' | 'number' | 'search'
    value: string
    options?: FilterOption[]
    placeholder?: string
    onChange: (value: string) => void
    /** Label shown on the applied chip (defaults to the field label). */
    chipLabel?: string
    /** Hide this field from the applied chips (e.g. a free-text search). */
    silent?: boolean
    /** Extra classes for the control wrapper. */
    className?: string
}

export type FilterChip = {
    key: string
    label: string
    onRemove: () => void
}

type FilterBarProps = {
    fields: FilterField[]
    /** Applied filters, rendered as removable chips. */
    chips?: FilterChip[]
    onClear?: () => void
    /** Primary action(s), pinned to the right. */
    actions?: ReactNode
    className?: string
}

/**
 * Compact filter toolbar.
 *
 * A dense single row of small, clearly labelled controls (instead of a tall
 * grid of stacked form fields), the applied filters as removable chips, and
 * the primary action pinned to the right.
 */
const FilterBar = ({
    fields,
    chips = [],
    onClear,
    actions,
    className,
}: FilterBarProps) => {
    const hasFilters = chips.length > 0

    return (
        <div
            className={classNames(
                'rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/40',
                className,
            )}
        >
            <div className="flex flex-wrap items-end gap-2">
                {fields.map((field) => (
                    <div
                        key={field.key}
                        className={classNames(
                            'flex min-w-[9rem] flex-1 flex-col gap-1',
                            field.className,
                        )}
                    >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            {field.label}
                        </span>
                        {field.kind === 'text' ? (
                            <Input
                                size="sm"
                                type={field.inputType ?? 'text'}
                                value={field.value}
                                placeholder={field.placeholder}
                                onChange={(e) => field.onChange(e.target.value)}
                            />
                        ) : (
                            <Select
                                size="sm"
                                isClearable
                                options={field.options ?? []}
                                value={
                                    (field.options ?? []).find(
                                        (o) => o.value === field.value,
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    field.onChange(option?.value ?? '')
                                }
                                placeholder={field.placeholder}
                            />
                        )}
                    </div>
                ))}

                {actions ? (
                    <div className="ml-auto flex items-center gap-2 pb-0.5">
                        {actions}
                    </div>
                ) : null}
            </div>

            {hasFilters ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-700/70">
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        Applied
                    </span>
                    {chips.map((chip) => (
                        <button
                            key={chip.key}
                            type="button"
                            onClick={chip.onRemove}
                            title={`Remove ${chip.label}`}
                            className="group inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2 pr-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-gray-100"
                        >
                            {chip.label}
                            <HiOutlineX className="text-[13px] opacity-60 group-hover:opacity-100" />
                        </button>
                    ))}
                    {onClear ? (
                        <Button
                            size="xs"
                            variant="plain"
                            className="ml-1 !text-[11px] !text-gray-500"
                            onClick={onClear}
                        >
                            Clear all
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

export default FilterBar
