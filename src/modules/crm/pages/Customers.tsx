'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Customer } from '@/modules/sd/services/customerMasterService'
import CrmSelect from '../components/CrmSelect'
import { useCrmCustomers } from '../hooks/useCrmCustomers'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import { crmTone, formatEnumLabel } from '../utils/format'

const statusFilterOptions = [
    { value: '', label: 'All statuses' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'BLOCKED', label: 'Blocked' },
]

export default function CustomersPage() {
    const { customers, loading, error, params, setParams } = useCrmCustomers()

    const columns = useMemo<ColumnDef<Customer>[]>(
        () => [
            {
                header: 'Customer',
                cell: ({ row }) => (
                    <Link
                        href={`/crm/customers/${row.original.id}`}
                        className="block hover:text-primary"
                    >
                        <span className="font-medium">{row.original.companyName}</span>
                        <span className="block text-xs text-gray-500">
                            {row.original.customerNumber}
                        </span>
                    </Link>
                ),
            },
            {
                header: 'Contact',
                cell: ({ row }) => (
                    <div className="text-sm">
                        <p>{row.original.contactName}</p>
                        <p className="text-xs text-gray-500">{row.original.email}</p>
                    </div>
                ),
            },
            {
                header: 'Phone',
                cell: ({ row }) => row.original.phone || '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={crmTone(row.original.status)}>
                        {formatEnumLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Customers"
                description="Customer master is maintained in Sales & Distribution. Open a customer for the CRM 360° view."
                breadcrumbs={crmPageBreadcrumbs('Customers')}
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search number, company, contact, email…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({ ...current, search: e.target.value }))
                        }
                    />
                    <CrmSelect
                        className="md:w-48"
                        options={statusFilterOptions}
                        value={params.status ?? ''}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                status: (value || undefined) as Customer['status'] | undefined,
                            }))
                        }
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={customers}
                    loading={loading}
                    noData={!loading && customers.length === 0}
                    hidePagination
                />
            </AdaptiveCard>
        </PageContainer>
    )
}
