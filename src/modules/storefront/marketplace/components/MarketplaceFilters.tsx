'use client'

import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'

export type FilterOption = { value: string; label: string; count: number }

type MarketplaceFiltersProps = {
    companies: FilterOption[]
    categories: FilterOption[]
    selectedCompanies: string[]
    selectedCategories: string[]
    onCompaniesChange: (values: string[]) => void
    onCategoriesChange: (values: string[]) => void
    onReset: () => void
}

const FilterSection = ({
    title,
    options,
    selected,
    onChange,
    emptyText,
}: {
    title: string
    options: FilterOption[]
    selected: string[]
    onChange: (values: string[]) => void
    emptyText: string
}) => (
    <section>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
        {options.length === 0 ? (
            <p className="text-sm text-gray-400">{emptyText}</p>
        ) : (
            <Checkbox.Group
                vertical
                value={selected}
                className="gap-3"
                checkboxClass="text-emerald-600"
                onChange={(values) => onChange(values.map(String))}
            >
                {options.map((option) => (
                    <Checkbox key={option.value} value={option.value}>
                        <span className="flex w-full items-center justify-between gap-2 text-sm text-gray-500">
                            <span>{option.label}</span>
                            <span className="text-xs text-gray-400">
                                {option.count}
                            </span>
                        </span>
                    </Checkbox>
                ))}
            </Checkbox.Group>
        )}
    </section>
)

/** Left-hand marketplace filters. Nothing ticked in a section means "all". */
const MarketplaceFilters = ({
    companies,
    categories,
    selectedCompanies,
    selectedCategories,
    onCompaniesChange,
    onCategoriesChange,
    onReset,
}: MarketplaceFiltersProps) => (
    <div className="flex flex-col gap-8">
        <FilterSection
            title="Shop by Company"
            options={companies}
            selected={selectedCompanies}
            onChange={onCompaniesChange}
            emptyText="No companies have published products yet."
        />
        <FilterSection
            title="Category"
            options={categories}
            selected={selectedCategories}
            onChange={onCategoriesChange}
            emptyText="No categories for the current company and store filters."
        />
        {selectedCompanies.length > 0 || selectedCategories.length > 0 ? (
            <Button
                size="sm"
                variant="plain"
                className="self-start !px-0 text-sm font-medium !text-gray-500 hover:!text-emerald-600"
                onClick={onReset}
            >
                Clear filters
            </Button>
        ) : null}
    </div>
)

export default MarketplaceFilters
