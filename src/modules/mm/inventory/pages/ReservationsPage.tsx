'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import InventoryResponsiveTable, { type ColumnDef } from '../components/InventoryResponsiveTable'
import {
    InvAnimatedStatus,
    InvDocNumberCell,
    fmtInvDate,
    InvPlainCell,
} from '../components/inventoryTableUi'
import { inventoryParentBreadcrumbs } from '../utils/inventoryPageUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineX,
    HiOutlineCube,
    HiOutlineLockClosed,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
} from 'react-icons/hi'
import {
    inventoryService,
    type AvailabilityResult,
} from '../services/inventoryService'
import { reservationService, type Reservation } from '../services/reservationService'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'

const ROUTE = '/modules/mm/inventory-management/reservations'

const SOURCE_OPTS = [
    { value: 'SALES_ORDER', label: 'Sales Order' },
    { value: 'PRODUCTION_ORDER', label: 'Production Order' },
    { value: 'MAINTENANCE_ORDER', label: 'Maintenance Order' },
    { value: 'INTERNAL_REQUEST', label: 'Internal Material Request' },
]

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'PARTIAL', label: 'Partial' },
    { value: 'FULFILLED', label: 'Fulfilled' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

/** Human label for the demand that created the reservation. */
const sourceLabel = (sourceType?: string | null) => {
    switch (sourceType) {
        case 'SALES_ORDER':
            return 'Sales order'
        case 'PRODUCTION_ORDER':
            return 'Production order'
        case 'MAINTENANCE_ORDER':
            return 'Maintenance order'
        case 'INTERNAL_REQUEST':
            return 'Internal request'
        default:
            return (sourceType ?? '—').replace(/_/g, ' ').toLowerCase()
    }
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ReservationsPage = () => {
    const parentBreadcrumbs = inventoryParentBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<Reservation[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 })
    const [summary, setSummary] = useState<
        { status: string; count: number; quantity: number; reservedQuantity: number }[]
    >([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [page, setPage] = useState(1)

    const { ensure, companies, warehouses, materials, loading: refsLoading } = useLazyMmRefs()

    const [createOpen, setCreateOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [cancelId, setCancelId] = useState<string | null>(null)
    const [form, setForm] = useState({
        companyId: '',
        warehouseId: '',
        materialId: '',
        quantity: 1,
        sourceType: 'INTERNAL_REQUEST',
        sourceModule: 'MM',
        sourceDocumentType: 'IMR',
        sourceDocumentId: '',
    })
    const [atpPreview, setAtpPreview] = useState<AvailabilityResult | null>(null)
    const [atpLoading, setAtpLoading] = useState(false)

    useEffect(() => {
        if (!form.companyId || !form.warehouseId || !form.materialId) {
            setAtpPreview(null)
            return
        }
        setAtpLoading(true)
        inventoryService
            .available({
                companyId: form.companyId,
                warehouseId: form.warehouseId,
                materialId: form.materialId,
            })
            .then(setAtpPreview)
            .catch(() => setAtpPreview(null))
            .finally(() => setAtpLoading(false))
    }, [form.companyId, form.warehouseId, form.materialId])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await reservationService.list({
                page,
                limit: 20,
                search: search || undefined,
                status: status || undefined,
            })
            setRows(res.data)
            setMeta({ total: res.meta.total, page: res.meta.page, limit: res.meta.limit })
            setSummary(res.summary?.byStatus ?? [])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [page, search, status])

    useEffect(() => {
        load()
    }, [load])

    const openCreate = useCallback(async () => {
        await ensure('companies', 'warehouses', 'materials')
        setCreateOpen(true)
    }, [ensure])

    const columns: ColumnDef<Reservation>[] = useMemo(
        () => [
            {
                header: 'Reservation',
                cell: ({ row }) => {
                    const r = row.original
                    return (
                        <InvDocNumberCell
                            icon="reservation"
                            primary={r.reservationNumber}
                            secondary={fmtInvDate(r.createdAt)}
                        />
                    )
                },
            },
            {
                header: 'Material',
                cell: ({ row }) => {
                    const m = row.original.material
                    return (
                        <SmEntityCell
                            kind="material"
                            primary={m?.materialName}
                            secondary={m?.materialCode ?? row.original.materialId.slice(0, 8)}
                        />
                    )
                },
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => (
                    <InvPlainCell>
                        {row.original.warehouse?.code ??
                            row.original.warehouse?.name ??
                            row.original.warehouseId.slice(0, 8)}
                    </InvPlainCell>
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => {
                    const r = row.original
                    const qty = Number(r.quantity ?? 0)
                    const reserved = Number(r.reservedQuantity ?? 0)
                    const fulfilled = Number(r.fulfilledQuantity ?? 0)
                    return (
                        <div className="min-w-[9rem] whitespace-nowrap text-right">
                            <div className="font-semibold text-gray-900">
                                {reserved.toLocaleString()}{' '}
                                <span className="text-xs font-normal text-gray-500">
                                    of {qty.toLocaleString()}
                                </span>
                            </div>
                            <div className="text-[11px] text-gray-400">
                                fulfilled {fulfilled.toLocaleString()}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Demand',
                cell: ({ row }) => (
                    <div className="min-w-[10rem] max-w-[11rem]">
                        <div className="truncate text-sm text-gray-700">
                            {sourceLabel(row.original.sourceType)}
                        </div>
                        <div
                            className="truncate font-mono text-[11px] text-gray-400"
                            title={row.original.sourceDocumentId}
                        >
                            {row.original.sourceDocumentId
                                ? `…${row.original.sourceDocumentId.slice(-8)}`
                                : '—'}
                        </div>
                    </div>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <InvAnimatedStatus status={row.original.status} />
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) =>
                    ['OPEN', 'PARTIAL'].includes(row.original.status) ? (
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineX />}
                            onClick={() => setCancelId(row.original.id)}
                        >
                            Cancel
                        </Button>
                    ) : null,
            },
        ],
        [],
    )

    const submitCreate = async () => {
        if (
            !form.companyId ||
            !form.warehouseId ||
            !form.materialId ||
            !form.sourceDocumentId
        ) {
            pushToast(
                'danger',
                'Validation',
                'Company, warehouse, material, and source document are required',
            )
            return
        }
        setSubmitting(true)
        try {
            await reservationService.create(form)
            pushToast('success', 'Reserved', 'Reservation created (on-hand unchanged)')
            setCreateOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
        }
    }

    const confirmCancel = async () => {
        if (!cancelId) return
        try {
            await reservationService.cancel(cancelId)
            pushToast('success', 'Cancelled', 'Reservation released')
            setCancelId(null)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const chips = useMemo<FilterChip[]>(() => {
        const list: FilterChip[] = []
        if (search)
            list.push({
                key: 'search',
                label: `Search: ${search}`,
                onRemove: () => setSearch(''),
            })
        if (status)
            list.push({
                key: 'status',
                label: `Status: ${
                    STATUS_FILTER_OPTIONS.find((o) => o.value === status)?.label ??
                    status
                }`,
                onRemove: () => setStatus(''),
            })
        return list
    }, [search, status])

    const fields = useMemo<FilterField[]>(
        () => [
            {
                key: 'search',
                label: 'Search',
                kind: 'text',
                inputType: 'search',
                value: search,
                placeholder: 'Reservation or source document…',
                onChange: (value) => {
                    setSearch(value)
                    setPage(1)
                },
            },
            {
                key: 'status',
                label: 'Status',
                value: status,
                options: STATUS_FILTER_OPTIONS,
                onChange: (value) => {
                    setStatus(value)
                    setPage(1)
                },
            },
        ],
        [search, status],
    )

    const countOf = (code: string) =>
        summary.find((s) => s.status === code)?.count ?? 0
    const reservedTotal = summary.reduce(
        (acc, s) => acc + s.reservedQuantity,
        0,
    )
    const openTotal = countOf('OPEN') + countOf('PARTIAL')

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Reservations"
                description="Allocate available stock for sales, production, maintenance, or internal demand without deducting on-hand."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        loading={refsLoading}
                        onClick={openCreate}
                    >
                        Create Reservation
                    </Button>
                }
            />

            <FilterBar
                className="mb-4"
                fields={fields}
                chips={chips}
                onClear={() => {
                    setSearch('')
                    setStatus('')
                    setPage(1)
                }}
            />

            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Reservations in scope"
                    value={meta.total.toLocaleString()}
                    tone="info"
                    icon={<HiOutlineClipboardList />}
                />
                <StatCard
                    label="Open / partial"
                    value={openTotal.toLocaleString()}
                    tone="warning"
                    icon={<HiOutlineCube />}
                />
                <StatCard
                    label="Reserved quantity"
                    value={reservedTotal.toLocaleString()}
                    tone="default"
                    icon={<HiOutlineLockClosed />}
                />
                <StatCard
                    label="Fulfilled"
                    value={countOf('FULFILLED').toLocaleString()}
                    tone="success"
                    icon={<HiOutlineCheckCircle />}
                />
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {meta.total} reservation{meta.total === 1 ? '' : 's'} in scope
                </span>
                <span>
                    Page {meta.page} · {meta.limit} per page
                </span>
            </div>

            <AdaptiveCard>
                <InventoryResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    compact
                    getRowId={(row) => row.id}
                    noData={rows.length === 0}
                    pagingData={{
                        total: meta.total,
                        pageIndex: page,
                        pageSize: meta.limit,
                    }}
                    onPaginationChange={setPage}
                    tableMinWidthClass="min-w-[980px]"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create Reservation"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={submitCreate}>
                            Reserve
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === form.companyId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === form.warehouseId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            options={materials}
                            value={materials.find((o) => o.value === form.materialId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, materialId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input
                            type="number"
                            min={0.000001}
                            value={form.quantity}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, quantity: Number(e.target.value) }))
                            }
                        />
                    </FormItem>
                    {atpLoading && (
                        <p className="text-sm text-gray-500">Loading availability…</p>
                    )}
                    {atpPreview && !atpLoading && (
                        <AdaptiveCard className="bg-gray-50 dark:bg-gray-800/50">
                            <div className="mb-2 text-sm font-medium">ATP preview (backend)</div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <div>On hand: {atpPreview.onHand}</div>
                                <div>Reserved: {atpPreview.reserved}</div>
                                <div>Available: {atpPreview.available}</div>
                            </div>
                            {form.quantity > atpPreview.available && (
                                <p className="mt-2 text-danger text-sm">
                                    Requested quantity exceeds available stock.
                                </p>
                            )}
                        </AdaptiveCard>
                    )}
                    <FormItem label="Source Type">
                        <Select
                            options={SOURCE_OPTS}
                            value={SOURCE_OPTS.find((o) => o.value === form.sourceType)}
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    sourceType: o?.value ?? 'INTERNAL_REQUEST',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source Document ID">
                        <Input
                            value={form.sourceDocumentId}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, sourceDocumentId: e.target.value }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!cancelId}
                type="danger"
                title="Cancel reservation?"
                onCancel={() => setCancelId(null)}
                onConfirm={confirmCancel}
            >
                <p>This releases reserved quantity back to available stock. On-hand is unchanged.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default ReservationsPage
