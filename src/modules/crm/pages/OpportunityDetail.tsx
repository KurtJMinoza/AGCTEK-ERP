'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import usePermissions from '@/utils/hooks/usePermissions'
import OpportunitySalesOrderDialog, {
    SalesOrderOriginBadges,
    SD_SALES_ORDERS_PATH,
    type SalesOrderDialogMode,
} from '../components/OpportunitySalesOrderDialog'
import OpportunityActivityPanel from '../components/opportunity/OpportunityActivityPanel'
import OpportunityDetailsPanel from '../components/opportunity/OpportunityDetailsPanel'
import OpportunityHeader from '../components/opportunity/OpportunityHeader'
import OpportunityKpiChips from '../components/opportunity/OpportunityKpiChips'
import OpportunityTimeline from '../components/opportunity/OpportunityTimeline'
import OpportunityQuotationsPanel, {
    QUOTATIONS_ANCHOR,
} from '../components/opportunity/OpportunityQuotationsPanel'
import { useActivities } from '../hooks/useOpportunityActivities'
import { useOpportunityQuotations } from '../hooks/useOpportunityQuotations'
import { useLinkedSalesOrder, useOpportunity } from '../hooks/useOpportunity'
import { apiCreateOpportunitySalesOrder, apiWinOpportunity } from '../services/crmApi'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import type { ActivityParent, CreateOpportunitySalesOrderResult } from '../types'

const Skeleton = ({ className }: { className: string }) => (
    <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700 ${className}`} />
)

/** Odoo-style record workspace: board/table scan, this page is where the deal is worked. */
export default function OpportunityDetailPage() {
    const params = useParams<{ id: string }>()
    const id = params?.id ?? ''
    const { opportunity, loading, error, notFound, reload, update } = useOpportunity(id)
    const parent = useMemo<ActivityParent | null>(() => (id ? { kind: 'opportunity', id } : null), [id])
    const activities = useActivities(parent)
    const { order: salesOrder, error: salesOrderError } = useLinkedSalesOrder(
        id,
        opportunity?.sdSalesOrderId,
    )
    const quotations = useOpportunityQuotations(id || null)
    const { can } = usePermissions()
    const canCreate = can('crm.opportunities', 'create')
    const canUpdate = can('crm.opportunities', 'update')
    const [handoffMode, setHandoffMode] = useState<SalesOrderDialogMode | null>(null)
    const [handoffResult, setHandoffResult] = useState<CreateOpportunitySalesOrderResult | null>(
        null,
    )

    if (!opportunity) {
        return (
            <PageContainer>
                <PageHeader title="Opportunity" breadcrumbs={crmPageBreadcrumbs('Opportunities')} />
                {notFound ? (
                    <Alert showIcon type="warning" title="Opportunity not found">
                        It may have been removed.{' '}
                        <Link href="/crm/opportunities" className="underline">
                            Back to opportunities
                        </Link>
                    </Alert>
                ) : error ? (
                    <Alert showIcon type="danger" title="Unable to load opportunity">
                        <span className="mr-2">{error}</span>
                        <Button size="xs" onClick={() => void reload()} loading={loading}>
                            Retry
                        </Button>
                    </Alert>
                ) : (
                    <div className="flex flex-col gap-4">
                        <Skeleton className="h-16" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-24" />
                            ))}
                        </div>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                            <Skeleton className="h-96 lg:col-span-3" />
                            <Skeleton className="h-96 lg:col-span-2" />
                        </div>
                    </div>
                )}
            </PageContainer>
        )
    }

    /** Activities change the server-computed next-activity badge on the opportunity. */
    const refreshBadge = () => void reload()
    /** Stage and customer changes can cancel or block quotations server-side. */
    const updateAndRefresh: typeof update = async (body) => {
        const result = await update(body)
        void quotations.reload()
        return result
    }
    const openQuotations = () => {
        setHandoffMode(null)
        document.getElementById(QUOTATIONS_ANCHOR)?.scrollIntoView({ behavior: 'smooth' })
    }
    const needsRetry =
        canUpdate && opportunity.stage === 'CLOSED_WON' && !opportunity.sdSalesOrderId

    return (
        <PageContainer>
            <OpportunityHeader
                opportunity={opportunity}
                canUpdate={canUpdate}
                onUpdate={async (body) => {
                    setHandoffResult(null)
                    await updateAndRefresh(body)
                    void activities.reload()
                }}
                onWin={() => setHandoffMode('win')}
                actions={
                    <div className="flex gap-2">
                        {needsRetry ? (
                            <Button variant="solid" onClick={() => setHandoffMode('retry')}>
                                Retry ERP handoff
                            </Button>
                        ) : null}
                        <Button
                            onClick={() => {
                                void reload()
                                void activities.reload()
                                void quotations.reload()
                            }}
                            loading={loading}
                        >
                            Refresh
                        </Button>
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            {handoffResult ? (
                <Alert
                    showIcon
                    closable
                    type="success"
                    className="mb-4"
                    title={
                        handoffResult.created
                            ? 'Closed Won — SD sales order created'
                            : 'Closed Won — linked to the existing SD sales order'
                    }
                    onClose={() => setHandoffResult(null)}
                >
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">
                            {handoffResult.salesOrder.orderNumber}
                        </span>
                        <SalesOrderOriginBadges order={handoffResult.salesOrder} />
                        <span>SD now owns pricing, confirmation, stock and delivery.</span>
                        <Link href={SD_SALES_ORDERS_PATH} className="underline">
                            Open SD sales orders
                        </Link>
                    </span>
                </Alert>
            ) : null}

            <div className="mb-4">
                <OpportunityKpiChips
                    opportunity={opportunity}
                    salesOrder={salesOrder}
                    salesOrderError={salesOrderError}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="flex flex-col gap-4 lg:col-span-3">
                    <OpportunityDetailsPanel
                        opportunity={opportunity}
                        canUpdate={canUpdate}
                        onUpdate={updateAndRefresh}
                    />
                    <OpportunityQuotationsPanel
                        opportunity={opportunity}
                        quotations={quotations.quotations}
                        loading={quotations.loading}
                        error={quotations.error}
                        reload={quotations.reload}
                        canCreate={canUpdate && can('sd.quotations', 'create')}
                        canManage={can('sd.quotations', 'update')}
                    />
                </div>
                <div className="flex flex-col gap-4 lg:col-span-2">
                    <OpportunityActivityPanel
                        opportunity={opportunity}
                        activities={activities.activities}
                        loading={activities.loading}
                        error={activities.error}
                        canCreate={canCreate}
                        canUpdate={canUpdate}
                        create={activities.create}
                        complete={activities.complete}
                        onChanged={refreshBadge}
                    />
                    <OpportunityTimeline
                        opportunity={opportunity}
                        activities={activities.activities}
                        salesOrder={salesOrder}
                    />
                </div>
            </div>

            {needsRetry ? (
                <AdaptiveCard className="mt-4">
                    <p className="text-sm text-gray-500">
                        This deal is Closed Won but has no SD sales order (it was won before the ERP
                        handoff ran). Use Retry ERP handoff to create it; SD then owns pricing, stock
                        and delivery.
                    </p>
                </AdaptiveCard>
            ) : null}

            <OpportunitySalesOrderDialog
                opportunity={handoffMode ? opportunity : null}
                mode={handoffMode ?? 'win'}
                canCreateOrder={can('sd.sales-orders', 'create')}
                onClose={() => setHandoffMode(null)}
                onOpenQuotation={openQuotations}
                onSubmit={handoffMode === 'retry' ? apiCreateOpportunitySalesOrder : apiWinOpportunity}
                onCreated={(result) => {
                    setHandoffMode(null)
                    setHandoffResult(result)
                    void reload()
                    void activities.reload()
                    void quotations.reload()
                }}
            />
        </PageContainer>
    )
}
