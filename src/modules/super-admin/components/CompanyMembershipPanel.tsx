'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import StatusBadge from '@/components/shared/StatusBadge'
import { USER_ROLES } from '@/constants/roles.constant'
import { HiOutlineOfficeBuilding, HiOutlinePlus } from 'react-icons/hi'
import { userManagementService } from '../services/userManagementService'
import type { CompanyOption, UserCompanyMembership } from '../types'

type CompanyMembershipPanelProps = {
    userId: string
    role: string
    /** Called after any membership change so the parent list can refresh. */
    onChange?: () => void
}

type SelectOption = { value: string; label: string }

function errorMessage(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string | string[] })
            ?.message
        if (Array.isArray(message)) return message.join(', ')
        if (message) return message
    }
    return fallback
}

const CompanyMembershipPanel = ({
    userId,
    role,
    onChange,
}: CompanyMembershipPanelProps) => {
    const [memberships, setMemberships] = useState<UserCompanyMembership[]>([])
    const [companies, setCompanies] = useState<CompanyOption[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCompanyId, setSelectedCompanyId] = useState('')
    const [busyKey, setBusyKey] = useState<string | null>(null)

    const requiresCompany = role !== USER_ROLES.SUPER_ADMIN

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [assigned, options] = await Promise.all([
                userManagementService.listUserCompanies(userId),
                userManagementService.listCompanyOptions(),
            ])
            setMemberships(assigned)
            setCompanies(options)
        } catch (error) {
            toast.push(
                <Notification type="danger" title="Unable to load companies">
                    {errorMessage(error, 'Please try again.')}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        load()
    }, [load])

    const availableOptions = useMemo<SelectOption[]>(() => {
        const assigned = new Set(memberships.map((m) => m.companyId))
        return companies
            .filter((c) => !assigned.has(c.id))
            .map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))
    }, [companies, memberships])

    const run = async (
        key: string,
        action: () => Promise<UserCompanyMembership[]>,
        failTitle: string,
    ) => {
        setBusyKey(key)
        try {
            setMemberships(await action())
            onChange?.()
        } catch (error) {
            toast.push(
                <Notification type="danger" title={failTitle}>
                    {errorMessage(error, 'Please try again.')}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setBusyKey(null)
        }
    }

    const handleAdd = async () => {
        if (!selectedCompanyId) return
        await run(
            'add',
            () => userManagementService.assignCompany(userId, selectedCompanyId),
            'Unable to add company',
        )
        setSelectedCompanyId('')
    }

    const isLastRequired = requiresCompany && memberships.length === 1

    return (
        <section>
            <div className="flex items-center gap-2">
                <HiOutlineOfficeBuilding className="text-lg text-primary" />
                <h5 className="font-semibold heading-text">Company Membership</h5>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Changes here apply immediately and are separate from the Save
                button above.
            </p>

            {loading ? (
                <div className="flex justify-center py-6">
                    <Spinner size={28} />
                </div>
            ) : (
                <>
                    {memberships.length === 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 dark:border-gray-600">
                            {requiresCompany
                                ? 'No company assigned. Users other than Super Admin should belong to at least one company.'
                                : 'No company assigned. Super Admins can operate without a company.'}
                        </div>
                    ) : (
                        <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                            {memberships.map((m) => (
                                <li
                                    key={m.id}
                                    className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium heading-text">
                                            {m.company.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {m.company.code}
                                        </div>
                                    </div>
                                    {m.isDefault ? (
                                        <StatusBadge tone="info">Default</StatusBadge>
                                    ) : (
                                        <Button
                                            size="xs"
                                            loading={busyKey === `default:${m.companyId}`}
                                            disabled={Boolean(busyKey)}
                                            onClick={() =>
                                                run(
                                                    `default:${m.companyId}`,
                                                    () =>
                                                        userManagementService.setDefaultCompany(
                                                            userId,
                                                            m.companyId,
                                                        ),
                                                    'Unable to set default',
                                                )
                                            }
                                        >
                                            Set default
                                        </Button>
                                    )}
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        className="text-red-500"
                                        loading={busyKey === `remove:${m.companyId}`}
                                        disabled={Boolean(busyKey) || isLastRequired}
                                        title={
                                            isLastRequired
                                                ? 'Users other than Super Admin must belong to at least one company.'
                                                : undefined
                                        }
                                        onClick={() =>
                                            run(
                                                `remove:${m.companyId}`,
                                                () =>
                                                    userManagementService.removeCompany(
                                                        userId,
                                                        m.companyId,
                                                    ),
                                                'Unable to remove company',
                                            )
                                        }
                                    >
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <div className="min-w-0 flex-1">
                            <Select<SelectOption>
                                size="sm"
                                placeholder={
                                    availableOptions.length
                                        ? 'Select a company to add'
                                        : 'All companies assigned'
                                }
                                isDisabled={!availableOptions.length}
                                options={availableOptions}
                                value={
                                    availableOptions.find(
                                        (o) => o.value === selectedCompanyId,
                                    ) ?? null
                                }
                                onChange={(opt) => setSelectedCompanyId(opt?.value ?? '')}
                            />
                        </div>
                        <Button
                            size="sm"
                            icon={<HiOutlinePlus />}
                            loading={busyKey === 'add'}
                            disabled={!selectedCompanyId || Boolean(busyKey)}
                            onClick={handleAdd}
                        >
                            Add company
                        </Button>
                    </div>
                </>
            )}
        </section>
    )
}

export default CompanyMembershipPanel
