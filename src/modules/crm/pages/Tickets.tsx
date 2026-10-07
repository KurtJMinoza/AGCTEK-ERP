'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import CrmSelect from '../components/CrmSelect'
import { ActivityStatusBadge } from '../components/NextActivityBadge'
import TicketActivitiesDialog from '../components/TicketActivitiesDialog'
import TicketCommentsDialog from '../components/TicketCommentsDialog'
import TicketFormDialog, { isTerminalTicket } from '../components/TicketFormDialog'
import { useTickets } from '../hooks/useTickets'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import { filterLabels, ticketParamsFromUrl } from '../utils/deepLinks'
import { crmTone, enumOptions, formatDate, formatEnumLabel } from '../utils/format'
import {
    TICKET_ACTIVITY_STATUSES,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    type Ticket,
    type TicketPriority,
    type TicketStatus,
} from '../types'

const ALL_STATUSES = '__ALL'
const statusFilterOptions = [
    { value: '', label: 'Queue: Open + Waiting customer' },
    { value: ALL_STATUSES, label: 'All statuses' },
    ...enumOptions(TICKET_STATUSES),
]
const priorityFilterOptions = [
    { value: '', label: 'All priorities' },
    ...enumOptions(TICKET_PRIORITIES),
]
const sortOptions = [
    { value: 'priority', label: 'Priority (urgent first)' },
    { value: 'newest', label: 'Newest first' },
]

export default function TicketsPage() {
    const {
        data,
        total,
        page,
        pageSize,
        loading,
        error,
        params,
        setParams,
        reload,
        create,
        update,
    } = useTickets(ticketParamsFromUrl(useSearchParams()))
    const { can } = usePermissions()
    const canCreate = can('crm', 'create')
    const canUpdate = can('crm', 'update')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Ticket | null>(null)
    const [viewing, setViewing] = useState<Ticket | null>(null)
    const [activitiesFor, setActivitiesFor] = useState<Ticket | null>(null)
    /** Prefer the reloaded row so the dialog header badge stays current. */
    const activitiesTicket = activitiesFor
        ? (data.find((row) => row.id === activitiesFor.id) ?? activitiesFor)
        : null

    const openDialog = (ticket: Ticket | null) => {
        setEditing(ticket)
        setDialogOpen(true)
    }

    const columns = useMemo<ColumnDef<Ticket>[]>(
        () => [
            {
                header: 'Subject',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="text-left font-medium hover:text-primary"
                        onClick={() => setViewing(row.original)}
                    >
                        {row.original.subject}
                        <span className="block text-xs font-normal text-gray-500">
                            {formatEnumLabel(row.original.category)} ·{' '}
                            {row.original._count.comments} comment
                            {row.original._count.comments === 1 ? '' : 's'}
                            {row.original.rmaReference ? ` · RMA ${row.original.rmaReference}` : ''}
                        </span>
                    </button>
                ),
            },
            {
                header: 'Customer',
                cell: ({ row }) => (
                    <Link
                        href={`/crm/customers/${row.original.customerId}`}
                        className="text-primary hover:underline"
                    >
                        {row.original.customer.companyName}
                    </Link>
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
                header: 'Priority',
                cell: ({ row }) => (
                    <StatusBadge tone={crmTone(row.original.priority)}>
                        {formatEnumLabel(row.original.priority)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Next activity',
                cell: ({ row }) =>
                    TICKET_ACTIVITY_STATUSES.includes(row.original.status) ? (
                        <div>
                            <ActivityStatusBadge
                                status={row.original.nextActivityStatus}
                                dueAt={row.original.nextActivityDueAt}
                            />
                            {row.original.nextActivityDueAt ? (
                                <p className="mt-1 text-xs text-gray-500">
                                    {formatDate(row.original.nextActivityDueAt)}
                                </p>
                            ) : null}
                        </div>
                    ) : null,
            },
            {
                header: 'Updated',
                cell: ({ row }) => formatDate(row.original.updatedAt),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end gap-1">
                        <Button size="xs" onClick={() => setActivitiesFor(row.original)}>
                            Activities
                        </Button>
                        <Button size="xs" onClick={() => setViewing(row.original)}>
                            Comments
                        </Button>
                        {canUpdate && !isTerminalTicket(row.original) ? (
                            <Button size="xs" onClick={() => openDialog(row.original)}>
                                Edit
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        [canUpdate],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Tickets"
                description="Customer service queue: Open and Waiting customer by default, most urgent first. RMA references are free text until the SD return flow is integrated."
                breadcrumbs={crmPageBreadcrumbs('Tickets')}
                actions={
                    canCreate ? (
                        <Button variant="solid" onClick={() => openDialog(null)}>
                            New ticket
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
                        placeholder="Search subject or RMA reference…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({ ...current, page: 1, search: e.target.value }))
                        }
                    />
                    <CrmSelect
                        className="md:w-64"
                        options={statusFilterOptions}
                        value={params.status ?? (params.queue === 'ALL' ? ALL_STATUSES : '')}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                queue: value === ALL_STATUSES ? 'ALL' : undefined,
                                status:
                                    value && value !== ALL_STATUSES
                                        ? (value as TicketStatus)
                                        : undefined,
                            }))
                        }
                    />
                    <CrmSelect
                        className="md:w-48"
                        options={priorityFilterOptions}
                        value={params.priority ?? ''}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                priority: (value || undefined) as TicketPriority | undefined,
                            }))
                        }
                    />
                    <CrmSelect
                        className="md:ml-auto md:w-52"
                        options={sortOptions}
                        value={params.sort ?? 'priority'}
                        onChange={(value) =>
                            setParams((current) => ({
                                ...current,
                                page: 1,
                                sort: value === 'newest' ? 'newest' : undefined,
                            }))
                        }
                    />
                </div>
                <ActiveFilters
                    filters={
                        params.activity
                            ? [{ key: 'activity', label: filterLabels.activity() }]
                            : []
                    }
                    onRemove={() =>
                        setParams((current) => ({ ...current, page: 1, activity: undefined }))
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

            <TicketFormDialog
                isOpen={dialogOpen}
                ticket={editing}
                onClose={() => setDialogOpen(false)}
                onCreate={create}
                onUpdate={update}
            />
            <TicketCommentsDialog
                ticket={viewing}
                canComment={canCreate}
                onClose={() => setViewing(null)}
                onCommented={() => void reload()}
            />
            <TicketActivitiesDialog
                ticket={activitiesTicket}
                canCreate={canCreate}
                canUpdate={canUpdate}
                onClose={() => setActivitiesFor(null)}
                onChanged={() => void reload()}
            />
        </PageContainer>
    )
}
