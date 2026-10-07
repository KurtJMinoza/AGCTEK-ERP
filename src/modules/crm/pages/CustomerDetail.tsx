'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import usePermissions from '@/utils/hooks/usePermissions'
import LoyaltyPanel from '../components/LoyaltyPanel'
import OpportunityFormDialog from '../components/OpportunityFormDialog'
import TicketActivitiesDialog from '../components/TicketActivitiesDialog'
import TicketCommentsDialog from '../components/TicketCommentsDialog'
import TicketFormDialog, { isTerminalTicket } from '../components/TicketFormDialog'
import { useCustomer360 } from '../hooks/useCustomer360'
import { crmCustomerBreadcrumbs, crmPageBreadcrumbs } from '../utils/breadcrumbs'
import {
    crmTone,
    formatDate,
    formatEnumLabel,
    formatMoney,
} from '../utils/format'
import { SD_SALES_ORDERS_PATH } from '../components/OpportunitySalesOrderDialog'
import { opportunityHref } from '../utils/deepLinks'
import type {
    Customer360Order,
    Customer360SectionState,
    Customer360Shipment,
    Opportunity,
    Ticket,
} from '../types'

/** A degraded section shows its placeholder; the rest of the page still renders. */
function Section({
    title,
    state,
    actions,
    children,
}: {
    title: string
    state?: Customer360SectionState
    actions?: ReactNode
    children: ReactNode
}) {
    return (
        <AdaptiveCard className="mb-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h5>{title}</h5>
                {actions}
            </div>
            {state && state.status !== 'ok' ? <SectionNotice state={state} /> : children}
        </AdaptiveCard>
    )
}

function SectionNotice({ state }: { state: Exclude<Customer360SectionState, { status: 'ok' }> }) {
    return (
        <Alert showIcon type={state.status === 'unavailable' ? 'warning' : 'info'}>
            {state.message}
            {state.status === 'unavailable' ? ' — the rest of this page is current; try again shortly.' : null}
        </Alert>
    )
}

const unavailableBadge = { tone: 'warning', label: 'Unavailable' } as const

export default function CustomerDetailPage() {
    const params = useParams<{ id: string }>()
    const customerId = params?.id ?? ''
    const {
        data,
        loading,
        error,
        reload,
        createOpportunity,
        updateOpportunity,
        createTicket,
        updateTicket,
    } = useCustomer360(customerId)
    const { can } = usePermissions()
    const canCreate = can('crm', 'create')
    const canUpdate = can('crm', 'update')

    const [opportunityDialog, setOpportunityDialog] = useState<{ row: Opportunity | null } | null>(
        null,
    )
    const [ticketDialog, setTicketDialog] = useState<{ row: Ticket | null } | null>(null)
    const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null)
    const [ticketActivitiesFor, setTicketActivitiesFor] = useState<Ticket | null>(null)

    const opportunityColumns = useMemo<ColumnDef<Opportunity>[]>(
        () => [
            {
                header: 'Opportunity',
                cell: ({ row }) => (
                    <Link
                        href={opportunityHref(row.original.id)}
                        className="font-medium text-primary hover:underline"
                    >
                        {row.original.name}
                    </Link>
                ),
            },
            {
                header: 'Stage',
                cell: ({ row }) => (
                    <StatusBadge tone={crmTone(row.original.stage)}>
                        {formatEnumLabel(row.original.stage)}
                    </StatusBadge>
                ),
            },
            {
                header: 'Amount',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(row.original.amount, row.original.currency)}
                    </span>
                ),
            },
            {
                header: 'Expected close',
                cell: ({ row }) => formatDate(row.original.expectedCloseDate),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <Link href={opportunityHref(row.original.id)}>
                            <Button size="xs">Open</Button>
                        </Link>
                    </div>
                ),
            },
        ],
        [],
    )

    const ticketColumns = useMemo<ColumnDef<Ticket>[]>(
        () => [
            {
                header: 'Subject',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="text-left font-medium hover:text-primary"
                        onClick={() => setViewingTicket(row.original)}
                    >
                        {row.original.subject}
                    </button>
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
            { header: 'Updated', cell: ({ row }) => formatDate(row.original.updatedAt) },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end gap-1">
                        <Button size="xs" onClick={() => setTicketActivitiesFor(row.original)}>
                            Activities
                        </Button>
                        <Button size="xs" onClick={() => setViewingTicket(row.original)}>
                            Comments
                        </Button>
                        {canUpdate && !isTerminalTicket(row.original) ? (
                            <Button size="xs" onClick={() => setTicketDialog({ row: row.original })}>
                                Edit
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        [canUpdate],
    )

    const orderNumberById = useMemo(
        () => new Map((data?.orders ?? []).map((o) => [o.id, o.orderNumber])),
        [data?.orders],
    )

    const orderColumns = useMemo<ColumnDef<Customer360Order>[]>(
        () => [
            {
                header: 'Order',
                cell: ({ row }) => <span className="font-medium">{row.original.orderNumber}</span>,
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={crmTone(row.original.status)}>
                        {formatEnumLabel(row.original.status)}
                    </StatusBadge>
                ),
            },
            { header: 'Channel', cell: ({ row }) => formatEnumLabel(row.original.channel) },
            {
                header: 'Total',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(
                            row.original.totalAmount === null ? null : Number(row.original.totalAmount),
                            row.original.currency,
                        )}
                    </span>
                ),
            },
            {
                header: 'From opportunity',
                cell: ({ row }) => row.original.opportunity?.name ?? '—',
            },
            { header: 'Created', cell: ({ row }) => formatDate(row.original.createdAt) },
        ],
        [],
    )

    const shipmentColumns = useMemo<ColumnDef<Customer360Shipment>[]>(
        () => [
            {
                header: 'Shipment',
                cell: ({ row }) => (
                    <div>
                        <p className="font-medium">{row.original.reference}</p>
                        {row.original.trackingNumber ? (
                            <p className="text-xs text-gray-500">
                                {row.original.carrier ? `${row.original.carrier} · ` : ''}
                                {row.original.trackingNumber}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Order',
                cell: ({ row }) =>
                    (row.original.salesOrderId && orderNumberById.get(row.original.salesOrderId)) ??
                    '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <div>
                        <StatusBadge tone={crmTone(row.original.status)}>
                            {formatEnumLabel(row.original.status)}
                        </StatusBadge>
                        {row.original.exceptionCode ? (
                            <p
                                className="mt-1 text-xs text-red-500"
                                title={row.original.exceptionNote ?? undefined}
                            >
                                {formatEnumLabel(row.original.exceptionCode)}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'ETA',
                cell: ({ row }) =>
                    formatDate(row.original.latestDeliveryAt ?? row.original.requestedDeliveryAt),
            },
            {
                header: 'Delivered',
                cell: ({ row }) =>
                    row.original.deliveredAt
                        ? `${formatDate(row.original.deliveredAt)}${row.original.hasProofOfDelivery ? ' · POD' : ''}`
                        : '—',
            },
        ],
        [orderNumberById],
    )

    if (!data) {
        return (
            <PageContainer>
                <PageHeader title="Customer" breadcrumbs={crmPageBreadcrumbs('Customers')} />
                {error ? (
                    <Alert showIcon type="danger" title="Unable to load customer">
                        {error}{' '}
                        <Link href="/crm/customers" className="underline">
                            Back to customers
                        </Link>
                    </Alert>
                ) : (
                    <p className="text-sm text-gray-500">{loading ? 'Loading…' : null}</p>
                )}
            </PageContainer>
        )
    }

    const { customer, profile, summary, loyalty, sections } = data
    const tier = loyalty?.tier ?? profile?.tier ?? null
    const ordersOk = sections.orders.status === 'ok'

    return (
        <PageContainer>
            <PageHeader
                title={customer.companyName}
                description={`${customer.customerNumber} · ${customer.contactName}`}
                breadcrumbs={crmCustomerBreadcrumbs(customer.companyName)}
                actions={
                    canCreate ? (
                        <div className="flex gap-2">
                            <Button onClick={() => setTicketDialog({ row: null })}>New ticket</Button>
                            <Button variant="solid" onClick={() => setOpportunityDialog({ row: null })}>
                                New opportunity
                            </Button>
                        </div>
                    ) : null
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Status</p>
                        <StatusBadge className="mt-1" tone={crmTone(customer.status)}>
                            {formatEnumLabel(customer.status)}
                        </StatusBadge>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Loyalty tier</p>
                        {tier ? (
                            <StatusBadge className="mt-1" tone="info">
                                {formatEnumLabel(tier)}
                            </StatusBadge>
                        ) : (
                            <p className="mt-1 text-gray-500">No loyalty account</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Contact</p>
                        <p className="mt-1">{customer.email || '—'}</p>
                        <p className="text-gray-500">{customer.phone || '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">
                            Customer since
                        </p>
                        <p className="mt-1">{formatDate(customer.createdAt)}</p>
                        <p className="text-gray-500">Currency {customer.currency}</p>
                    </div>
                </div>
                {sections.profile.status !== 'ok' ? (
                    <div className="mt-4">
                        <SectionNotice state={sections.profile} />
                    </div>
                ) : null}
                {profile?.notes ? (
                    <p className="mt-4 whitespace-pre-wrap border-t border-gray-100 pt-3 text-sm dark:border-gray-700">
                        {profile.notes}
                    </p>
                ) : null}
            </AdaptiveCard>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                    label="Open opportunities"
                    value={summary.openOpportunities ?? '—'}
                    tone="info"
                    badge={summary.openOpportunities === null ? unavailableBadge : undefined}
                />
                <StatCard
                    label="Open tickets"
                    value={summary.openTickets ?? '—'}
                    tone="warning"
                    badge={summary.openTickets === null ? unavailableBadge : undefined}
                />
                <StatCard
                    label="Loyalty points"
                    value={loyalty?.pointsBalance ?? '—'}
                    tone="success"
                    badge={loyalty ? undefined : unavailableBadge}
                />
                <StatCard
                    label="Recent SD orders"
                    value={ordersOk ? data.orders.length : '—'}
                    badge={ordersOk ? undefined : unavailableBadge}
                />
                <StatCard
                    label="Revenue"
                    value="—"
                    badge={{ tone: 'default', label: 'FICO integration pending' }}
                />
            </div>

            <Section title="Opportunities" state={sections.opportunities}>
                <DataTable
                    columns={opportunityColumns}
                    data={data.opportunities}
                    loading={loading}
                    noData={!loading && data.opportunities.length === 0}
                    hidePagination
                />
            </Section>

            <Section
                title="SD sales orders"
                state={sections.orders}
                actions={
                    <Link href={SD_SALES_ORDERS_PATH} className="text-sm text-primary hover:underline">
                        Open in SD
                    </Link>
                }
            >
                <DataTable
                    columns={orderColumns}
                    data={data.orders}
                    loading={loading}
                    noData={!loading && data.orders.length === 0}
                    hidePagination
                />
            </Section>

            <Section title="Shipments (SCM)" state={sections.shipments}>
                <DataTable
                    columns={shipmentColumns}
                    data={data.shipments}
                    loading={loading}
                    noData={!loading && data.shipments.length === 0}
                    hidePagination
                />
            </Section>

            <Section title="Tickets" state={sections.tickets}>
                <DataTable
                    columns={ticketColumns}
                    data={data.tickets}
                    loading={loading}
                    noData={!loading && data.tickets.length === 0}
                    hidePagination
                />
            </Section>

            <Section title="Loyalty" state={sections.loyalty}>
                <LoyaltyPanel loyalty={loyalty} loading={loading} />
            </Section>

            <OpportunityFormDialog
                isOpen={Boolean(opportunityDialog)}
                opportunity={opportunityDialog?.row ?? null}
                customerId={customer.id}
                onClose={() => setOpportunityDialog(null)}
                onCreate={createOpportunity}
                onUpdate={updateOpportunity}
            />
            <TicketFormDialog
                isOpen={Boolean(ticketDialog)}
                ticket={ticketDialog?.row ?? null}
                customerId={customer.id}
                onClose={() => setTicketDialog(null)}
                onCreate={createTicket}
                onUpdate={updateTicket}
            />
            <TicketCommentsDialog
                ticket={viewingTicket}
                canComment={canCreate}
                onClose={() => setViewingTicket(null)}
                onCommented={() => void reload()}
            />
            <TicketActivitiesDialog
                ticket={ticketActivitiesFor}
                canCreate={canCreate}
                canUpdate={canUpdate}
                onClose={() => setTicketActivitiesFor(null)}
            />
        </PageContainer>
    )
}
