'use client'

import { useMemo } from 'react'
import Select from '@/components/ui/Select'
import {
    buildUomCodeOptions,
    UOM_SELECT_PORTAL,
    type UomCategory,
    type UomLike,
} from './uomHelpers'

type UomCodeSelectProps = {
    category: UomCategory
    uoms: UomLike[]
    value?: string
    onChange: (code: string) => void
    placeholder?: string
    isClearable?: boolean
}

const UomCodeSelect = ({
    category,
    uoms,
    value = '',
    onChange,
    placeholder,
    isClearable = true,
}: UomCodeSelectProps) => {
    const options = useMemo(
        () => buildUomCodeOptions(uoms, category, value),
        [uoms, category, value],
    )

    return (
        <Select
            {...UOM_SELECT_PORTAL}
            isClearable={isClearable}
            placeholder={placeholder ?? 'Select UOM'}
            options={options}
            value={options.find((o) => o.value === value) ?? null}
            onChange={(opt) => onChange(opt?.value ?? '')}
        />
    )
}

export default UomCodeSelect
