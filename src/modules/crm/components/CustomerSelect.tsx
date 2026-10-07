'use client'

import { useMemo } from 'react'
import CrmSelect from './CrmSelect'
import { useCrmCustomers } from '../hooks/useCrmCustomers'

type CustomerSelectProps = {
    value: string | null
    onChange: (customerId: string | null) => void
    placeholder?: string
    isClearable?: boolean
    isDisabled?: boolean
    className?: string
}

export default function CustomerSelect({
    value,
    onChange,
    placeholder = 'Select customer',
    isClearable,
    isDisabled,
    className,
}: CustomerSelectProps) {
    const { customers, loading } = useCrmCustomers()
    const options = useMemo(
        () =>
            customers.map((customer) => ({
                value: customer.id,
                label: `${customer.companyName} (${customer.customerNumber})`,
            })),
        [customers],
    )

    return (
        <CrmSelect
            className={className}
            options={options}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            isClearable={isClearable}
            isDisabled={isDisabled}
            isLoading={loading}
        />
    )
}
