'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    HiOutlineArrowRight,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineTruck,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import ErpBackLink from '@/components/erp/ErpBackLink'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Steps from '@/components/ui/Steps'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { startSalesOrderFulfillment } from '../services/salesOrderDashboardService'
import {
    getDelivery,
    listDeliveries,
    type Delivery,
    type DeliveryDetail,
    type DeliveryLine,
    type DeliveryNextAction,
    type DeliveryStage,
} from '../services/deliveryService'

const ROUTE_PATH = '/modules/sd/deliveries'
const SEARCH_DEBOUNCE_MS = 350

const STAGE_ORDER: DeliveryStage[] = ['PENDING_PICK', 'PICKING', 'PACKED', 'SHIPPED']

const STAGE_META: Record<DeliveryStage, { label: string; tone: StatusTone }> = {
    PENDING_PICK: { label: 'Pending pick', tone: 'default' },
    PICKING: { label: 'Picking', tone: 'warning' },
    PACKED: { label: 'Packed', tone: 'info' },
    SHIPPED: { label: 'Shipped / PGI', tone: 'success' },
}

/** MM owns pick, pack and goods issue; SD hands the team over to the right screen. */
const MM_SCREENS: Record<Exclude<DeliveryNextAction, 'RELEASE_TO_WAREHOUSE' | null>, {
    label: string
    path: string
}> = {
    PICK: { label: 'Go to Picking', path: '/modules/mm/warehouse-management/picking' },
    PACK: { label: 'Go to Packing', path: '/modules/mm/warehouse-management/packing' },
    POST_GOODS_ISSUE: {
        label: 'Post Goods Issue',
        path: '/modules/mm/inventory-management/goods-issue',
    },
}

type StageFilterOption = { value: DeliveryStage | ''; label: string }

const STAGE_FILTER_OPTIONS: StageFilterOption[] = [
    { value: '', label: 'All stages' },
    ...STAGE_ORDER.map((stage) => ({ value: stage, label: STAGE_META[stage].label })),
]

const notify = (type: 'success' | 'danger', title: string, message: string) =>
    toast.push(
        <Notification type={type} title={title} closable>
            {message}
        </Notification>,
        { placement: 'top-end' },
    )

const formatDate = (value: string | null) =>
    value
        ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
        : '—'

const StageBadge = ({ stage }: { stage: DeliveryStage }) => (
    <StatusBadge tone={STAGE_META[stage].tone}>{STAGE_META[stage].label}</StatusBadge>
)

const SummaryStat = ({
    label,
    value,
    active,
    onClick,
}: {
    label: string
    value: number
    active: boolean
    onClick: () => void
}) => (
    <Card
        clickable
        className={active ? 'ring-2 ring-primary' : undefined}
        onClick={onClick}
    >
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-bold sm:text-2xl">{value}</div>
    </Card>
)

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="text-sm font-medium">{children}</div>
    </div>
)

const lineColumns: ColumnDef<DeliveryLine>[] = [
    { header: '#', accessorKey: 'lineNumber', size: 40 },
    {
        header: 'Item',
        id: 'item',
        cell: ({ row }) => (
            <div className="min-w-[10rem]">
                <div className="font-semibold">{row.original.name}</div>
                {row.original.variantName ? (
                    <div className="text-xs text-gray-500">{row.original.variantName}</div>
                ) : null}
            </div>
        ),
    },
    {
        header: 'SKU',
        id: 'sku',
        cell: ({ row }) => (
            <span className="font-mono text-xs">{row.original.sku ?? '—'}</span>
        ),
    },
    {
        header: 'Ordered',
        id: 'quantity',
        cell: ({ row }) =>
            `${row.original.quantity}${row.original.uom ? ` ${row.original.uom}` : ''}`,
    },
    {
        header: 'Picked',
        id: 'picked',
        cell: ({ row }) =>
            row.original.pickRequiredQty > 0
                ? `${row.original.pickedQty} / ${row.original.pickRequiredQty}`
                : '—',
    },
    { header: 'Issued', id: 'issued', cell: ({ row }) => row.original.issuedQty },
]

const DeliveriesDashboard = () => {
    const router = useRouter()
    const breadcrumbItems = useMemo(() => buildErpBreadcrumbs(ROUTE_PATH), [])
    const { canUpdate } = useResourceAccess('sd.deliveries')

    const [stage, setStage] = useState<DeliveryStage | ''>('')
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<Delivery[]>([])
    const [total, setTotal] = useState(0)
    const [summary, setSummary] = useState<Record<DeliveryStage, number> | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [releasingId, setReleasingId] = useState<string | null>(null)
    const [detail, setDetail] = useState<DeliveryDetail | null>(null)
    const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const result = await listDeliveries({
                stage: stage || undefined,
                search,
                page,
                pageSize,
            })
            setRows(result.data)
            setTotal(result.total)
            setSummary(result.summary)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load deliveries')
        } finally {
            setLoading(false)
        }
    }, [stage, search, page, pageSize])

    useEffect(() => {
        void fetchList()
    }, [fetchList])

    useEffect(() => {
        if (searchInput.trim() === search) return
        const timer = window.setTimeout(() => {
            setSearch(searchInput.trim())
            setPage(1)
        }, SEARCH_DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [searchInput, search])

    const selectStage = (next: DeliveryStage | '') => {
        setStage(next)
        setPage(1)
    }

    const openDetail = useCallback(async (salesOrderId: string) => {
        setDetailLoadingId(salesOrderId)
        try {
            setDetail(await getDelivery(salesOrderId))
        } catch (err) {
            notify(
                'danger',
                'Delivery not loaded',
                err instanceof Error ? err.message : 'Please try again.',
            )
        } finally {
            setDetailLoadingId(null)
        }
    }, [])

    const releaseToWarehouse = useCallback(
        async (delivery: Delivery) => {
            setReleasingId(delivery.salesOrderId)
            try {
                const result = await startSalesOrderFulfillment(delivery.salesOrderId)
                notify(
                    'success',
                    'Released to warehouse',
                    `${delivery.deliveryNumber}: picking task ${result.pickingTask.taskNumber} is ready in MM.`,
                )
                await fetchList()
            } catch (err) {
                notify(
                    'danger',
                    'Release failed',
                    err instanceof Error ? err.message : 'Please try again.',
                )
            } finally {
                setReleasingId(null)
            }
        },
        [fetchList],
    )

    const renderNextAction = useCallback(
        (delivery: Delivery) => {
            const action = delivery.nextAction
            if (!action) {
                return <span className="text-xs text-gray-400">No action needed</span>
            }
            if (action === 'RELEASE_TO_WAREHOUSE') {
                return canUpdate ? (
                    <Button
                        size="xs"
                        variant="solid"
                        className="whitespace-nowrap"
                        loading={releasingId === delivery.salesOrderId}
                        onClick={() => void releaseToWarehouse(delivery)}
                    >
                        Release to warehouse
                    </Button>
                ) : (
                    <span className="text-xs text-gray-400">Awaiting release</span>
                )
            }
            const screen = MM_SCREENS[action]
            return (
                <Button
                    size="xs"
                    className="whitespace-nowrap"
                    icon={<HiOutlineArrowRight />}
                    iconAlignment="end"
                    onClick={() => router.push(screen.path)}
                >
                    {screen.label}
                </Button>
            )
        },
        [canUpdate, releaseToWarehouse, releasingId, router],
    )

    const columns = useMemo<ColumnDef<Delivery>[]>(
        () => [
            {
                header: 'Delivery #',
                id: 'deliveryNumber',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="font-mono font-semibold text-primary hover:underline disabled:opacity-60"
                        disabled={detailLoadingId === row.original.salesOrderId}
                        onClick={() => void openDetail(row.original.salesOrderId)}
                    >
                        {row.original.deliveryNumber}
                    </button>
                ),
            },
            {
                header: 'Sales Order',
                id: 'salesOrderReference',
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.original.salesOrderReference}</span>
                ),
            },
            {
                header: 'Customer',
                id: 'customerName',
                cell: ({ row }) => row.original.customerName ?? '—',
            },
            {
                header: 'Status',
                id: 'stage',
                cell: ({ row }) => (
                    <div className="flex flex-col items-start gap-1">
                        <StageBadge stage={row.original.stage} />
                        {row.original.stage === 'PICKING' && row.original.requiredQty > 0 ? (
                            <span className="text-xs text-gray-500">
                                {row.original.pickedQty} / {row.original.requiredQty} picked
                            </span>
                        ) : null}
                    </div>
                ),
            },
            {
                header: 'Created',
                id: 'createdAt',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap">{formatDate(row.original.createdAt)}</span>
                ),
            },
            {
                header: 'Update Status',
                id: 'nextAction',
                cell: ({ row }) => renderNextAction(row.original),
            },
        ],
        [detailLoadingId, openDetail, renderNextAction],
    )

    const shipToLines = detail
        ? [
              detail.shipTo.addressLine1,
              [detail.shipTo.city, detail.shipTo.region, detail.shipTo.postalCode]
                  .filter(Boolean)
                  .join(', '),
              detail.shipTo.country,
          ].filter(Boolean)
        : []

    return (
        <PageContainer>
            <ErpBackLink items={breadcrumbItems} />
            <Breadcrumb items={breadcrumbItems} className="mb-4" />
            <PageHeader
                title="Outbound Deliveries"
                description="Approved orders moving through picking, packing and goods issue. Warehouse steps are performed in Materials Management."
                icon={<HiOutlineTruck />}
                actions={
                    <Button
                        size="sm"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={() => void fetchList()}
                    >
                        Refresh
                    </Button>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                    className="md:max-w-md"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Search order number, customer name or email..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                />
                <div className="md:w-48">
                    <Select<StageFilterOption>
                        isSearchable={false}
                        options={STAGE_FILTER_OPTIONS}
                        value={STAGE_FILTER_OPTIONS.find((option) => option.value === stage)}
                        onChange={(option) => selectStage(option?.value ?? '')}
                    />
                </div>
            </div>

            <div className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                {STAGE_ORDER.map((key) => (
                    <SummaryStat
                        key={key}
                        label={STAGE_META[key].label}
                        value={summary?.[key] ?? 0}
                        active={stage === key}
                        onClick={() => selectStage(stage === key ? '' : key)}
                    />
                ))}
            </div>

            <Card>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading && rows.length === 0}
                    noData={!loading && rows.length === 0}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={(size) => {
                        setPageSize(size)
                        setPage(1)
                    }}
                />
            </Card>

            <FormDialog
                isOpen={detail !== null}
                onClose={() => setDetail(null)}
                size="xl"
                icon={<HiOutlineTruck />}
                title={detail ? `Delivery ${detail.deliveryNumber}` : 'Delivery'}
                description={
                    detail
                        ? `Sales order ${detail.salesOrderReference} · ${detail.channel}`
                        : undefined
                }
                headerExtra={
                    detail ? (
                        <Steps current={STAGE_ORDER.indexOf(detail.stage)}>
                            {STAGE_ORDER.map((key) => (
                                <Steps.Item key={key} title={STAGE_META[key].label} />
                            ))}
                        </Steps>
                    ) : undefined
                }
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div>{renderNextAction(detail)}</div>
                            <Button size="sm" onClick={() => setDetail(null)}>
                                Close
                            </Button>
                        </>
                    ) : null
                }
            >
                {detail ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Field label="Status">
                                <StageBadge stage={detail.stage} />
                            </Field>
                            <Field label="Customer">
                                {detail.customerName ?? '—'}
                                {detail.customerEmail ? (
                                    <div className="text-xs font-normal text-gray-500">
                                        {detail.customerEmail}
                                    </div>
                                ) : null}
                            </Field>
                            <Field label="Warehouse">
                                {detail.warehouses.length
                                    ? detail.warehouses
                                          .map((w) => `${w.code} — ${w.name}`)
                                          .join(', ')
                                    : 'Not assigned yet'}
                            </Field>
                            <Field label="Created">{formatDate(detail.createdAt)}</Field>
                            <Field label="Shipped">{formatDate(detail.shippedAt)}</Field>
                            <Field label="Courier / tracking">
                                {[detail.courierName, detail.trackingNumber]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                            </Field>
                        </div>

                        <div>
                            <h6 className="mb-2 text-sm font-semibold heading-text">
                                Shipping address
                            </h6>
                            <Card bodyClass="p-3">
                                {shipToLines.length ? (
                                    <div className="text-sm">
                                        <div className="font-semibold">
                                            {detail.shipTo.name ?? detail.customerName}
                                        </div>
                                        {shipToLines.map((line) => (
                                            <div key={line}>{line}</div>
                                        ))}
                                        {detail.shipTo.phone ? (
                                            <div className="text-gray-500">
                                                {detail.shipTo.phone}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <span className="text-sm text-gray-400">
                                        No shipping address on this order.
                                    </span>
                                )}
                            </Card>
                        </div>

                        <div>
                            <h6 className="mb-2 text-sm font-semibold heading-text">
                                Line items
                            </h6>
                            <DataTable
                                columns={lineColumns}
                                data={detail.lines}
                                compact
                                fit
                                hidePagination
                                noData={detail.lines.length === 0}
                            />
                        </div>

                        {detail.documents.pickingTasks.length ||
                        detail.documents.packages.length ||
                        detail.documents.goodsIssues.length ? (
                            <div>
                                <h6 className="mb-2 text-sm font-semibold heading-text">
                                    Warehouse documents (MM)
                                </h6>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        ...detail.documents.pickingTasks.map((d) => ({
                                            ...d,
                                            kind: 'Pick',
                                        })),
                                        ...detail.documents.packages.map((d) => ({
                                            ...d,
                                            kind: 'Package',
                                        })),
                                        ...detail.documents.goodsIssues.map((d) => ({
                                            ...d,
                                            kind: 'Goods issue',
                                        })),
                                    ].map((doc) => (
                                        <StatusBadge key={`${doc.kind}-${doc.number}`}>
                                            {doc.kind} {doc.number} · {doc.status}
                                        </StatusBadge>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </FormDialog>
        </PageContainer>
    )
}

export default DeliveriesDashboard
