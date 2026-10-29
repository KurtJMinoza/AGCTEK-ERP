'use client'

import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import usePermissions from '@/utils/hooks/usePermissions'
import LoyaltyPanel from '../components/LoyaltyPanel'
import CardGrid from '../components/customer360/CardGrid'
import SalesOrderCard from '../components/customer360/SalesOrderCard'
import ShipmentCard, { SCM_SHIPMENTS_PATH } from '../components/customer360/ShipmentCard'
import { shipmentActivityAt } from '../components/customer360/statusTones'
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
import type { Customer360SectionState, Opportunity, Ticket } from '../types'

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

/** A section that loaded with no records (distinct from a failed load, which shows SectionNotice). */
function EmptySection({ children }: { children: ReactNode }) {
    return <p className="py-6 text-center text-sm text-gray-500">{children}</p>
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
/** Recent cards per section; the full lists live in SD / SCM. */
const CARD_LIMIT = 5

const CUSTOMER_360_TABS = [
    'opportunities',
    'orders',
    'shipments',
    'invoices',
    'tickets',
    'loyalty',
] as const
type Customer360Tab = (typeof CUSTOMER_360_TABS)[number]
const isCustomer360Tab = (value: string | null): value is Customer360Tab =>
    (CUSTOMER_360_TABS as readonly string[]).includes(value ?? '')

const { TabList, TabNav, TabContent } = Tabs

/** Tab label with a count when the section loaded (`null` hides it). */
function TabLabel({ label, count }: { label: string; count: number | null }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {label}
            {count !== null ? (
                <span className="rounded-full bg-gray-100 px-1.5 text-xs tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {count}
                </span>
            ) : null}
        </span>
    )
}
const SD_CUSTOMER_MASTER_PATH = '/modules/sd/customer-master'

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
    const canCreate = can('crm.tickets', 'create')
    const canUpdate = can('crm.tickets', 'update')

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
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const tabParam = searchParams.get('tab')
    /** `?tab=` wins; otherwise shop accounts (orders, no deals) open on Orders, the rest on Opportunities. */
    const tab: Customer360Tab = isCustomer360Tab(tabParam)
        ? tabParam
        : data && data.opportunities.length === 0 && data.orders.length > 0
          ? 'orders'
          : 'opportunities'
    const selectTab = (next: string) => {
        const query = new URLSearchParams(searchParams.toString())
        query.set('tab', next)
        router.replace(`${pathname}?${query.toString()}`, { scroll: false })
    }

    const recentShipments = useMemo(
        () =>
            [...(data?.shipments ?? [])]
                .sort((a, b) => shipmentActivityAt(b) - shipmentActivityAt(a))
                .slice(0, CARD_LIMIT),
        [data?.shipments],
    )

    if (!data) {
        return (
            <PageContainer>
                <PageHeader title="Customer" breadcrumbs={crmPageBreadcrumbs('/crm/customers')} />
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
                breadcrumbs={crmCustomerBreadcrumbs(customer.companyName, customer.id)}
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
                    label="Orders"
                    value={ordersOk ? (summary.salesOrders ?? data.orders.length) : '—'}
                    badge={
                        !ordersOk
                            ? unavailableBadge
                            : data.unlinkedShopAccounts.length
                              ? { tone: 'warning', label: 'Shop account not linked' }
                              : undefined
                    }
                />
                <StatCard
                    label="Revenue"
                    value="—"
                    badge={{ tone: 'default', label: 'FICO integration pending' }}
                />
            </div>

            <Tabs value={tab} onChange={selectTab}>
                <TabList className="mb-4 overflow-x-auto">
                    <TabNav value="opportunities" className="shrink-0">
                        <TabLabel
                            label="Opportunities"
                            count={sections.opportunities.status === 'ok' ? data.opportunities.length : null}
                        />
                    </TabNav>
                    <TabNav value="orders" className="shrink-0">
                        <TabLabel label="Orders" count={ordersOk ? (summary.salesOrders ?? null) : null} />
                    </TabNav>
                    <TabNav value="shipments" className="shrink-0">
                        <TabLabel
                            label="Shipments"
                            count={sections.shipments.status === 'ok' ? data.shipments.length : null}
                        />
                    </TabNav>
                    <TabNav value="invoices" className="shrink-0">
                        <TabLabel
                            label="Invoices"
                            count={sections.invoices.status === 'ok' ? data.invoices.length : null}
                        />
                    </TabNav>
                    <TabNav value="tickets" className="shrink-0">
                        <TabLabel
                            label="Tickets"
                            count={sections.tickets.status === 'ok' ? data.tickets.length : null}
                        />
                    </TabNav>
                    <TabNav value="loyalty" className="shrink-0">
                        <TabLabel label="Loyalty" count={null} />
                    </TabNav>
                </TabList>

                <TabContent value="opportunities">
                    <Section title="Opportunities" state={sections.opportunities}>
                        {!loading && data.opportunities.length === 0 ? (
                            <EmptySection>No opportunities for this customer yet.</EmptySection>
                        ) : (
                            <DataTable
                                columns={opportunityColumns}
                                data={data.opportunities}
                                loading={loading}
                                hidePagination
                            />
                        )}
                    </Section>
                </TabContent>

                <TabContent value="orders">
                    <Section title="Recent sales orders" state={sections.orders}>
                        {data.unlinkedShopAccounts.map((account) => (
                            <Alert key={account.id} showIcon type="warning" className="mb-3">
                                Shop account {account.email} is not linked to this Customer Master, so its storefront
                                orders (and their shipments) are not shown here.{' '}
                                <Link href={SD_CUSTOMER_MASTER_PATH} className="underline">
                                    Link it in SD Customer Master
                                </Link>
                                .
                            </Alert>
                        ))}
                        <CardGrid
                            loading={loading}
                            shown={Math.min(data.orders.length, CARD_LIMIT)}
                            total={summary.salesOrders ?? data.orders.length}
                            emptyText="No sales orders for this customer yet."
                            fullList={
                                <Link href={SD_SALES_ORDERS_PATH} className="text-primary hover:underline">
                                    Open in SD
                                </Link>
                            }
                        >
                            {data.orders.slice(0, CARD_LIMIT).map((order) => (
                                <SalesOrderCard key={order.id} order={order} />
                            ))}
                        </CardGrid>
                    </Section>
                </TabContent>

                <TabContent value="shipments">
                    <Section title="Recent shipments" state={sections.shipments}>
                        <CardGrid
                            loading={loading}
                            shown={recentShipments.length}
                            total={data.shipments.length}
                            emptyText="No shipments for this customer's orders yet."
                            fullList={
                                <Link href={SCM_SHIPMENTS_PATH} className="text-primary hover:underline">
                                    Open in SCM
                                </Link>
                            }
                        >
                            {recentShipments.map((shipment) => (
                                <ShipmentCard
                                    key={shipment.id}
                                    shipment={shipment}
                                    orderNumber={
                                        (shipment.salesOrderId && orderNumberById.get(shipment.salesOrderId)) || null
                                    }
                                />
                            ))}
                        </CardGrid>
                    </Section>
                </TabContent>

                <TabContent value="tickets">
                    <Section title="Tickets" state={sections.tickets}>
                        {!loading && data.tickets.length === 0 ? (
                            <EmptySection>No tickets for this customer yet.</EmptySection>
                        ) : (
                            <DataTable
                                columns={ticketColumns}
                                data={data.tickets}
                                loading={loading}
                                hidePagination
                            />
                        )}
                    </Section>
                </TabContent>

                <TabContent value="invoices">
                    <Section title="Invoices" state={sections.invoices}>
                        <EmptySection>No invoices for this customer yet.</EmptySection>
                    </Section>
                </TabContent>

                <TabContent value="loyalty">
                    <Section title="Loyalty" state={sections.loyalty}>
                        <LoyaltyPanel
                            loyalty={loyalty}
                            loading={loading}
                            customerId={customer.id}
                            orders={data.orders}
                            canMockEarn={can('crm.loyalty-admin', 'update')}
                            onChanged={() => void reload()}
                        />
                    </Section>
                </TabContent>
            </Tabs>

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
                canDecideReturn={canUpdate}
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
