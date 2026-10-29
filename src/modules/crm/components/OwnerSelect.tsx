'use client'

import { useEffect, useMemo, useState } from 'react'
import CrmSelect from './CrmSelect'
import { apiListCrmUsers } from '../services/crmApi'
import { formatUserName } from '../utils/format'
import type { CrmUserRef } from '../types'

type OwnerSelectProps = {
    value: string | null
    onChange: (userId: string | null) => void
    /** Display fields of the current owner, shown even when not in the active-user list. */
    currentOwner?: CrmUserRef | null
    isDisabled?: boolean
    isClearable?: boolean
    placeholder?: string
}

/** Active CRM users (server-filtered) for owner / assignee fields. */
export default function OwnerSelect({
    value,
    onChange,
    currentOwner,
    isDisabled,
    isClearable,
    placeholder = 'Select an owner',
}: OwnerSelectProps) {
    const [users, setUsers] = useState<CrmUserRef[] | null>(null)

    useEffect(() => {
        let active = true
        apiListCrmUsers()
            .then((rows) => {
                if (active) setUsers(rows)
            })
            .catch(() => {
                if (active) setUsers([])
            })
        return () => {
            active = false
        }
    }, [])

    const options = useMemo(() => {
        const list = (users ?? []).map((user) => ({ value: user.id, label: formatUserName(user) }))
        if (value && !list.some((option) => option.value === value)) {
            list.unshift({ value, label: formatUserName(currentOwner, 'Current owner') })
        }
        return list
    }, [users, value, currentOwner])

    return (
        <CrmSelect
            options={options}
            value={value}
            isLoading={users === null}
            isDisabled={isDisabled}
            isClearable={isClearable}
            placeholder={placeholder}
            onChange={onChange}
        />
    )
}
