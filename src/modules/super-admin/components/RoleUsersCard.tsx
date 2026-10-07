'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { SUPER_ADMIN_USERS_PATH } from '@/constants/route.constant'
import { userManagementService } from '../services/userManagementService'
import type { ManagedUser } from '../types'

const PAGE_SIZE = 100

/** Read-only: users are assigned a role in User Management; permissions are never edited per user. */
const RoleUsersCard = ({ roleCode }: { roleCode: string }) => {
    const [users, setUsers] = useState<ManagedUser[] | null>(null)
    const [total, setTotal] = useState(0)
    const [error, setError] = useState(false)

    useEffect(() => {
        let active = true
        setUsers(null)
        setError(false)
        userManagementService
            .list({ role: roleCode, page: 1, pageSize: PAGE_SIZE })
            .then((res) => {
                if (!active) return
                setUsers(res.data)
                setTotal(res.total)
            })
            .catch(() => active && setError(true))
        return () => {
            active = false
        }
    }, [roleCode])

    return (
        <AdaptiveCard>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="heading-text">
                    Users with this role{users ? ` (${total})` : ''}
                </h4>
                <Link href={SUPER_ADMIN_USERS_PATH}>
                    <Button size="xs">Manage users</Button>
                </Link>
            </div>
            {error ? (
                <p className="text-sm text-red-500">Failed to load users.</p>
            ) : !users ? (
                <Spinner size={24} />
            ) : users.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    No users have this role. Assign it in User Management.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
                    {users.map((user) => {
                        const name = [user.firstName, user.lastName]
                            .filter(Boolean)
                            .join(' ')
                        return (
                            <li
                                key={user.id}
                                className="flex items-center justify-between gap-3 py-2 text-sm"
                            >
                                <div className="min-w-0">
                                    <span className="font-medium heading-text">
                                        {name || user.userName}
                                    </span>
                                    <span className="ml-2 text-xs text-gray-500">
                                        @{user.userName} · {user.email}
                                    </span>
                                </div>
                                {user.isActive ? (
                                    <StatusBadge tone="success">
                                        Active
                                    </StatusBadge>
                                ) : (
                                    <StatusBadge tone="danger">
                                        Inactive
                                    </StatusBadge>
                                )}
                            </li>
                        )
                    })}
                    {total > users.length && (
                        <li className="py-2 text-xs text-gray-500">
                            Showing {users.length} of {total}. Filter by this
                            role in User Management to see everyone.
                        </li>
                    )}
                </ul>
            )}
        </AdaptiveCard>
    )
}

export default RoleUsersCard
