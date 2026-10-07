'use client'

import Select from '@/components/ui/Select'

export type CrmOption = { value: string; label: string }

type CrmSelectProps = {
    options: CrmOption[]
    value: string | null | undefined
    onChange: (value: string | null) => void
    placeholder?: string
    isClearable?: boolean
    isDisabled?: boolean
    isLoading?: boolean
    className?: string
}

/** ECME Select with a body portal so menus are not clipped inside dialogs. */
export default function CrmSelect({
    options,
    value,
    onChange,
    placeholder,
    isClearable,
    isDisabled,
    isLoading,
    className,
}: CrmSelectProps) {
    return (
        <Select
            className={className}
            options={options}
            value={options.find((option) => option.value === value) ?? null}
            placeholder={placeholder}
            isClearable={isClearable}
            isDisabled={isDisabled}
            isLoading={isLoading}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
            menuPosition="fixed"
            styles={{
                menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 9999 }),
            }}
            onChange={(option) => onChange((option as CrmOption | null)?.value ?? null)}
        />
    )
}
