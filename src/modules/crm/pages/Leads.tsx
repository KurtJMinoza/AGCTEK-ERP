'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import usePermissions from '@/utils/hooks/usePermissions'
import ActiveFilters from '../components/ActiveFilters'
import ConvertLeadDialog from '../components/ConvertLeadDialog'
import CrmSelect from '../components/CrmSelect'
import LeadFormDialog from '../components/LeadFormDialog'
import { useLeads } from '../hooks/useLeads'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import { filterLabels, leadParamsFromUrl } from '../utils/deepLinks'
import { crmTone, enumOptions, formatDate, formatEnumLabel } from '../utils/format'
import {
    CONVERTIBLE_LEAD_STATUSES,
    LEAD_SOURCES,
    LEAD_STATUSES,
    type ConvertLeadResult,
    type Lead,
    type LeadSource,
    type LeadStatus,
} from '../types'

const statusFilterOptions = [{ value: '', label: 'All statuses' }, ...enumOptions(LEAD_STATUSES)]
const sourceFilterOptions = [{ value: '', label: 'All sources' }, ...enumOptions(LEAD_SOURCES)]

export default function LeadsPage() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        create,
        update,
        convert,
    } = useLeads(leadParamsFromUrl(useSearchParams()))
    const router = useRouter()
    const { can } = usePermissions()
    const canCreate = can('crm', 'create')
    const canUpdate = can('crm', 'update')
    const canCreateSdCustomer = can('sd', 'create')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Lead | null>(null)
    const [converting, setConverting] = useState<Lead | null>(null)

    const onConverted = (result: ConvertLeadResult) => {
        setConverting(null)
        router.push(`/crm/customers/${result.customer.id}`)
    }

    const openDialog = (lead: Lead | null) => {
        setEditing(lead)
        setDialogOpen(true)
    }

    const columns = useMemo<ColumnDef<Lead>[]>(
        () => [
            {
                header: 'Lead',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{row.original.name}</p>
                        <p className="text-xs text-gray-500">
                            {[row.original.email, row.original.phone].filter(Boolean).join(' · ') ||
                                '—'}
                        </p>
                    </div>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={crmTone(row.original.status)}>
                        {formatEnumLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Source',
                cell: ({ row }) => formatEnumLabel(row.original.source),
            },
            {
                header: 'Customer',
                cell: ({ row }) =>
                    row.original.customer ? (
                        <Link
                            href={`/crm/customers/${row.original.customer.id}`}
                            className="text-primary hover:underline"
                        >
                            {row.original.customer.companyName}
                        </Link>
                    ) : (
                        <span className="text-gray-400">Not linked</span>
                    ),
            },
            {
                header: 'Score',
                cell: ({ row }) => row.original.score ?? '—',
            },
            {
                header: 'Created',
                cell: ({ row }) => formatDate(row.original.createdAt),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        {canCreate && CONVERTIBLE_LEAD_STATUSES.includes(row.original.status) ? (
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={() => setConverting(row.original)}
                            >
                                Convert
                            </Button>
                        ) : null}
                        <Button size="xs" onClick={() => openDialog(row.original)}>
                            {canUpdate && row.original.status !== 'CONVERTED' ? 'Edit' : 'View'}
                        </Button>
                    </div>
                ),
            },
        ],
        [canCreate, canUpdate],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Leads"
                description="Prospects before they become opportunities. Converting creates an opportunity for an SD customer."
                breadcrumbs={crmPageBreadcrumbs('Leads')}
                actions={
                    canCreate ? (
                        <Button variant="solid" onClick={() => openDialog(null)}>
                            New lead
                        </Button>
                    ) : null
                }
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
                        placeholder="Search name, email, phone…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({ ...current, page: 1, search: e.target.value }))
                        }
                    />
                    <CrmSelect
                        className="md:w-48"
                        options={statusFilterOptions}
                        value={params.status ?? ''}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                status: (value || undefined) as LeadStatus | undefined,
                            }))
                        }
                    />
                    <CrmSelect
                        className="md:w-48"
                        options={sourceFilterOptions}
                        value={params.source ?? ''}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                source: (value || undefined) as LeadSource | undefined,
                            }))
                        }
                    />
                </div>
                <ActiveFilters
                    filters={
                        params.createdFrom
                            ? [
                                  {
                                      key: 'createdFrom',
                                      label: filterLabels.createdFrom(params.createdFrom),
                                  },
                              ]
                            : []
                    }
                    onRemove={() =>
                        setParams((current) => ({ ...current, page: 1, createdFrom: undefined }))
                    }
                />
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={data}
                    loading={loading}
                    noData={!loading && data.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={(nextPage) =>
                        setParams((current) => ({ ...current, page: nextPage }))
                    }
                    onSelectChange={(nextSize) =>
                        setParams((current) => ({ ...current, page: 1, pageSize: nextSize }))
                    }
                />
            </AdaptiveCard>

            <LeadFormDialog
                isOpen={dialogOpen}
                lead={editing}
                onClose={() => setDialogOpen(false)}
                onCreate={create}
                onUpdate={update}
            />

            <ConvertLeadDialog
                lead={converting}
                canCreateCustomer={canCreateSdCustomer}
                onClose={() => setConverting(null)}
                onConvert={convert}
                onConverted={onConverted}
            />
        </PageContainer>
    )
}
