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
import ActiveFilters, { type ActiveFilter } from '../components/ActiveFilters'
import CrmSelect from '../components/CrmSelect'
import NextActivityBadge from '../components/NextActivityBadge'
import OpportunityActivitiesDialog from '../components/OpportunityActivitiesDialog'
import OpportunityBoard from '../components/OpportunityBoard'
import OpportunityFormDialog from '../components/OpportunityFormDialog'
import OpportunitySalesOrderDialog from '../components/OpportunitySalesOrderDialog'
import { apiCreateOpportunitySalesOrder } from '../services/crmApi'
import { useOpportunities } from '../hooks/useOpportunities'
import { useOpportunityPipeline } from '../hooks/useOpportunityPipeline'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import { filterLabels, opportunityHref, opportunityParamsFromUrl } from '../utils/deepLinks'
import {
    crmTone,
    enumOptions,
    formatDate,
    formatEnumLabel,
    formatMoney,
} from '../utils/format'
import {
    OPPORTUNITY_STAGES,
    type CreateOpportunityInput,
    type Opportunity,
    type OpportunityStage,
    type UpdateOpportunityInput,
} from '../types'

const stageFilterOptions = [{ value: '', label: 'All stages' }, ...enumOptions(OPPORTUNITY_STAGES)]

/** API maximum page size; the board shows at most this many cards. */
const BOARD_PAGE_SIZE = 100

type View = 'table' | 'board'

export default function OpportunitiesPage() {
    const searchParams = useSearchParams()
    const [view, setView] = useState<View>(() =>
        searchParams.get('view') === 'board' ? 'board' : 'table',
    )
    const urlParams = opportunityParamsFromUrl(searchParams)
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
    } = useOpportunities(
        view === 'board'
            ? { ...urlParams, stage: undefined, pageSize: BOARD_PAGE_SIZE }
            : urlParams,
    )
    const { pipeline, error: pipelineError, reload: reloadPipeline } = useOpportunityPipeline({
        search: params.search,
    })
    const { can } = usePermissions()

    const router = useRouter()

    /** New opportunities open straight in their workspace. */
    const createAndOpen = async (body: CreateOpportunityInput) => {
        const created = await create(body)
        router.push(opportunityHref(created.id))
        return created
    }

    const updateAndRefresh = async (id: string, body: UpdateOpportunityInput) => {
        const updated = await update(id, body)
        void reloadPipeline()
        return updated
    }
    const canCreate = can('crm', 'create')
    const canUpdate = can('crm', 'update')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [activitiesFor, setActivitiesFor] = useState<Opportunity | null>(null)
    const [salesOrderFor, setSalesOrderFor] = useState<Opportunity | null>(null)
    /** Prefer the reloaded row so the dialog header badge stays current. */
    const activitiesOpportunity = activitiesFor
        ? (data.find((row) => row.id === activitiesFor.id) ?? activitiesFor)
        : null

    const switchView = (next: View) => {
        setView(next)
        setParams((current) =>
            next === 'board'
                ? { ...current, page: 1, pageSize: BOARD_PAGE_SIZE, stage: undefined }
                : { ...current, page: 1, pageSize: 10 },
        )
    }

    const activeFilters: ActiveFilter[] = [
        ...(params.activity ? [{ key: 'activity', label: filterLabels.activity() }] : []),
        ...(params.lostReason
            ? [{ key: 'lostReason', label: filterLabels.lostReason(params.lostReason) }]
            : []),
        ...(params.closedFrom
            ? [{ key: 'closedFrom', label: filterLabels.closedFrom(params.closedFrom) }]
            : []),
    ]

    const columns = useMemo<ColumnDef<Opportunity>[]>(
        () => [
            {
                header: 'Opportunity',
                cell: ({ row }) => (
                    <div>
                        <Link
                            href={opportunityHref(row.original.id)}
                            className="font-medium text-primary hover:underline"
                        >
                            {row.original.name}
                        </Link>
                        {row.original.lead ? (
                            <p className="text-xs text-gray-500">Lead: {row.original.lead.name}</p>
                        ) : null}
                    </div>
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
                header: 'Stage',
                cell: ({ row }) => (
                    <div>
                        <StatusBadge tone={crmTone(row.original.stage)}>
                            {formatEnumLabel(row.original.stage)}
                        </StatusBadge>
                        {row.original.lostReason ? (
                            <p
                                className="mt-1 text-xs text-gray-500"
                                title={row.original.lostNotes ?? undefined}
                            >
                                {formatEnumLabel(row.original.lostReason)}
                            </p>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Next activity',
                cell: ({ row }) => (
                    <div>
                        <NextActivityBadge opportunity={row.original} />
                        {row.original.nextActivityDueAt ? (
                            <p className="mt-1 text-xs text-gray-500">
                                {formatDate(row.original.nextActivityDueAt)}
                            </p>
                        ) : null}
                    </div>
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
                header: 'Probability',
                cell: ({ row }) =>
                    row.original.probability == null ? '—' : `${row.original.probability}%`,
            },
            {
                header: 'Expected close',
                cell: ({ row }) => formatDate(row.original.expectedCloseDate),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button size="xs" onClick={() => setActivitiesFor(row.original)}>
                            Activities
                        </Button>
                        {row.original.sdSalesOrderId ? (
                            <Button size="xs" onClick={() => setSalesOrderFor(row.original)}>
                                SD order
                            </Button>
                        ) : canUpdate && row.original.stage === 'CLOSED_WON' ? (
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={() => setSalesOrderFor(row.original)}
                            >
                                Retry ERP handoff
                            </Button>
                        ) : null}
                        <Link href={opportunityHref(row.original.id)}>
                            <Button size="xs" variant="solid">
                                Open
                            </Button>
                        </Link>
                    </div>
                ),
            },
        ],
        [canUpdate],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Opportunities"
                description="Sales pipeline per SD customer. Closing as won (from the opportunity workspace) creates the SD sales order in the same step."
                breadcrumbs={crmPageBreadcrumbs('Opportunities')}
                actions={
                    canCreate ? (
                        <Button variant="solid" onClick={() => setDialogOpen(true)}>
                            New opportunity
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
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-6">
                    <h6 className="shrink-0">Open pipeline</h6>
                    {pipelineError ? (
                        <span className="text-sm text-red-500">{pipelineError}</span>
                    ) : !pipeline ? (
                        <span className="text-sm text-gray-500">Loading…</span>
                    ) : pipeline.totals.length === 0 ? (
                        <span className="text-sm text-gray-500">No open opportunities.</span>
                    ) : (
                        pipeline.totals.map((total) => (
                            <div key={total.currency} className="flex flex-wrap gap-x-4 text-sm">
                                <span>
                                    <span className="text-gray-500">{total.count} open · </span>
                                    <span className="tabular-nums">
                                        {formatMoney(Number(total.amount), total.currency)}
                                    </span>
                                </span>
                                <span>
                                    <span className="text-gray-500">Weighted </span>
                                    <span className="font-semibold tabular-nums heading-text">
                                        {formatMoney(Number(total.weightedAmount), total.currency)}
                                    </span>
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search opportunity name…"
                        value={params.search ?? ''}
                        onChange={(e) =>
                            setParams((current) => ({ ...current, page: 1, search: e.target.value }))
                        }
                    />
                    {view === 'table' ? (
                        <CrmSelect
                            className="md:w-48"
                            options={stageFilterOptions}
                            value={params.stage ?? ''}
                            onChange={(value) =>
                                setParams((current) => ({
                                    ...current,
                                    page: 1,
                                    stage: (value || undefined) as OpportunityStage | undefined,
                                }))
                            }
                        />
                    ) : null}
                    <div className="flex gap-1 md:ml-auto">
                        <Button
                            size="sm"
                            variant={view === 'table' ? 'solid' : 'default'}
                            onClick={() => switchView('table')}
                        >
                            Table
                        </Button>
                        <Button
                            size="sm"
                            variant={view === 'board' ? 'solid' : 'default'}
                            onClick={() => switchView('board')}
                        >
                            Board
                        </Button>
                    </div>
                </div>
                <ActiveFilters
                    filters={activeFilters}
                    onRemove={(key) =>
                        setParams((current) => ({ ...current, page: 1, [key]: undefined }))
                    }
                />
            </AdaptiveCard>

            <AdaptiveCard>
                {view === 'table' ? (
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
                ) : (
                    <>
                        {total > data.length ? (
                            <p className="mb-3 text-xs text-gray-500">
                                Showing the {data.length} most recent of {total} opportunities. Use
                                search or the table view to find the rest.
                            </p>
                        ) : null}
                        {loading && data.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
                        ) : (
                            <OpportunityBoard
                                opportunities={data}
                                pipeline={pipeline}
                                onOpen={(row) => router.push(opportunityHref(row.id))}
                                onOpenActivities={setActivitiesFor}
                            />
                        )}
                    </>
                )}
            </AdaptiveCard>

            <OpportunityFormDialog
                isOpen={dialogOpen}
                opportunity={null}
                onClose={() => setDialogOpen(false)}
                onCreate={createAndOpen}
                onUpdate={updateAndRefresh}
            />

            <OpportunityActivitiesDialog
                opportunity={activitiesOpportunity}
                canCreate={canCreate}
                canUpdate={canUpdate}
                onClose={() => setActivitiesFor(null)}
                onChanged={() => void reload()}
            />

            <OpportunitySalesOrderDialog
                opportunity={salesOrderFor}
                mode="retry"
                canCreateOrder={can('sd', 'create')}
                onClose={() => setSalesOrderFor(null)}
                onSubmit={apiCreateOpportunitySalesOrder}
                onCreated={(result) => {
                    setSalesOrderFor(result.opportunity)
                    void reload()
                }}
            />
        </PageContainer>
    )
}
