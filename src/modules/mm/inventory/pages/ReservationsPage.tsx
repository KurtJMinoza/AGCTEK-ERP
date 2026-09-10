'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineSearch, HiOutlineX } from 'react-icons/hi'
import { reservationService, type Reservation } from '../services/reservationService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/reservations'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'info',
    PARTIAL: 'warning',
    FULFILLED: 'success',
    CANCELLED: 'danger',
    EXPIRED: 'default',
}

const SOURCE_OPTS = [
    { value: 'SALES_ORDER', label: 'Sales Order' },
    { value: 'PRODUCTION_ORDER', label: 'Production Order' },
    { value: 'MAINTENANCE_ORDER', label: 'Maintenance Order' },
    { value: 'INTERNAL_REQUEST', label: 'Internal Material Request' },
]

const STATUS_FILTER_OPTIONS: Opt[] = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'PARTIAL', label: 'Partial' },
    { value: 'FULFILLED', label: 'Fulfilled' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(<Notification type={type} title={title} closable duration={3500}>{msg}</Notification>, { placement: 'top-end' })
}

const ReservationsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<Reservation[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 })
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [page, setPage] = useState(1)

    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])

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
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [page, search, status])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
        ]).then(([cos, wh, mats]: any[]) => {
            setCompanies((Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({ value: c.id, label: c.name || c.code })))
            setWarehouses((wh?.data ?? []).map((w: any) => ({ value: w.id, label: `${w.code} — ${w.name}` })))
            setMaterials((mats?.data ?? []).map((m: any) => ({
                value: m.id,
                label: `${m.materialCode} — ${m.materialName}`,
            })))
        }).catch(() => undefined)
    }, [])

    const columns: ColumnDef<Reservation>[] = useMemo(() => [
        { header: 'Reservation', accessorKey: 'reservationNumber' },
        {
            header: 'Material',
            cell: ({ row }) =>
                row.original.material?.materialCode ?? row.original.materialId.slice(0, 8),
        },
        {
            header: 'Warehouse',
            cell: ({ row }) => row.original.warehouse?.name ?? row.original.warehouseId.slice(0, 8),
        },
        {
            header: 'Qty / Reserved',
            cell: ({ row }) =>
                `${Number(row.original.quantity)} / ${Number(row.original.reservedQuantity)}`,
        },
        {
            header: 'Fulfilled',
            cell: ({ row }) => Number(row.original.fulfilledQuantity),
        },
        { header: 'Source', accessorKey: 'sourceType' },
        {
            header: 'Document',
            cell: ({ row }) =>
                `${row.original.sourceDocumentType}:${row.original.sourceDocumentId}`,
        },
        {
            header: 'Status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {row.original.status}
                </StatusBadge>
            ),
        },
        {
            header: '',
            id: 'actions',
            cell: ({ row }) =>
                ['OPEN', 'PARTIAL'].includes(row.original.status) ? (
                    <Button size="xs" variant="plain" icon={<HiOutlineX />} onClick={() => setCancelId(row.original.id)}>
                        Cancel
                    </Button>
                ) : null,
        },
    ], [])

    const submitCreate = async () => {
        if (!form.companyId || !form.warehouseId || !form.materialId || !form.sourceDocumentId) {
            pushToast('danger', 'Validation', 'Company, warehouse, material, and source document are required')
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

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Reservations"
                description="Allocate available stock for sales, production, maintenance, or internal demand without deducting on-hand."
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={() => setCreateOpen(true)}>
                        Create Reservation
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                        prefix={<HiOutlineSearch className="text-lg" />}
                        placeholder="Search reservation / source…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                    />
                    <Select<Opt>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === status)}
                        onChange={(opt) => { setStatus(opt?.value ?? ''); setPage(1) }}
                    />
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total: meta.total, pageIndex: page, pageSize: 20 }}
                    onPaginationChange={setPage}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create Reservation"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={submitting} onClick={submitCreate}>Reserve</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select options={companies} value={companies.find((o) => o.value === form.companyId)}
                            onChange={(o: any) => setForm((f) => ({ ...f, companyId: o?.value ?? '' }))} />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select options={warehouses} value={warehouses.find((o) => o.value === form.warehouseId)}
                            onChange={(o: any) => setForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))} />
                    </FormItem>
                    <FormItem label="Material">
                        <Select options={materials} value={materials.find((o) => o.value === form.materialId)}
                            onChange={(o: any) => setForm((f) => ({ ...f, materialId: o?.value ?? '' }))} />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input type="number" min={0.000001} value={form.quantity}
                            onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
                    </FormItem>
                    <FormItem label="Source Type">
                        <Select options={SOURCE_OPTS} value={SOURCE_OPTS.find((o) => o.value === form.sourceType)}
                            onChange={(o: any) => setForm((f) => ({ ...f, sourceType: o?.value ?? 'INTERNAL_REQUEST' }))} />
                    </FormItem>
                    <FormItem label="Source Document ID">
                        <Input value={form.sourceDocumentId}
                            onChange={(e) => setForm((f) => ({ ...f, sourceDocumentId: e.target.value }))} />
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
