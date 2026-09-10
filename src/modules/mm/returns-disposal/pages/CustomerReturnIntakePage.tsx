'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineReply } from 'react-icons/hi'
import { returnsDisposalService } from '../services/returnsDisposalService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import type { CustomerReturn } from '../types'
import type { Warehouse } from '../../warehouse/types'
import type { Material } from '../../material-master/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import InfoCard from '../../shared/InfoCard'
import type { CustomerReturnLine } from '../types'

const ROUTE = '/modules/mm/returns-disposal/customer-return-intake'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    INTAKE: 'info',
    INSPECTION: 'warning',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    REVERSED: 'warning',
}

const DISPOSITION_OPTS = [
    { value: 'RESTOCK', label: 'Restock' },
    { value: 'REPAIR', label: 'Repair' },
    { value: 'BLOCK', label: 'Block' },
    { value: 'SCRAP', label: 'Scrap' },
]

type FilterOption = { value: string; label: string }

const STATUS_FILTER_OPTIONS: FilterOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'INTAKE', label: 'Intake' },
    { value: 'INSPECTION', label: 'Inspection' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'COMPLETED', label: 'Completed' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const CustomerReturnIntakePage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [statusFilter, setStatusFilter] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [rows, setRows] = useState<CustomerReturn[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [materials, setMaterials] = useState<Material[]>([])

    const fetchList = useCallback(async () => {
        setLoading(true)
        try {
            const res = await returnsDisposalService.listCustomerReturns({
                page,
                pageSize,
                status: statusFilter || undefined,
            })
            setRows(res.data)
            setTotal(res.total)
        } catch {
            pushToast('danger', 'Error', 'Failed to load customer returns')
        } finally {
            setLoading(false)
        }
    }, [page, pageSize, statusFilter])

    useEffect(() => {
        fetchList()
    }, [fetchList])

    useEffect(() => {
        warehouseService
            .list({ limit: 500 })
            .then((r: any) => setWarehouses(Array.isArray(r) ? r : (r?.data ?? [])))
            .catch(() => {})
        materialService
            .list({ limit: 500 })
            .then((r: any) => setMaterials(Array.isArray(r) ? r : (r?.data ?? [])))
            .catch(() => {})
    }, [])

    const warehouseOpts = useMemo(
        () => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
        [warehouses],
    )
    const materialOpts = useMemo(
        () =>
            materials.map((m) => ({
                value: m.id,
                label: `${m.materialCode} — ${m.materialName}`,
            })),
        [materials],
    )

    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createForm, setCreateForm] = useState({
        warehouseId: '',
        customerName: '',
        customerRef: '',
        reason: '',
    })
    const [createLine, setCreateLine] = useState({
        materialId: '',
        quantity: 1,
        unitCost: 0,
    })

    const openCreate = useCallback(() => {
        setCreateForm({ warehouseId: '', customerName: '', customerRef: '', reason: '' })
        setCreateLine({ materialId: '', quantity: 1, unitCost: 0 })
        setCreateOpen(true)
    }, [])

    const handleCreate = async () => {
        if (!createForm.warehouseId || !createLine.materialId) {
            pushToast('danger', 'Validation', 'Warehouse and material are required')
            return
        }
        setCreating(true)
        try {
            const wh = warehouses.find((w) => w.id === createForm.warehouseId)
            const mat = materials.find((m) => m.id === createLine.materialId)
            await returnsDisposalService.createCustomerReturn({
                companyId: wh?.companyId || '',
                warehouseId: createForm.warehouseId,
                customerName: createForm.customerName || undefined,
                customerRef: createForm.customerRef || undefined,
                reason: createForm.reason || undefined,
                lines: [
                    {
                        materialId: createLine.materialId,
                        uomId: mat?.baseUomId || '',
                        quantity: createLine.quantity,
                        unitCost: createLine.unitCost,
                    },
                ],
            })
            pushToast('success', 'Created', 'Customer return draft created')
            setCreateOpen(false)
            fetchList()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setCreating(false)
        }
    }

    const [detail, setDetail] = useState<CustomerReturn | null>(null)

    const openDetail = async (id: string) => {
        try {
            setDetail(await returnsDisposalService.getCustomerReturn(id))
        } catch {
            pushToast('danger', 'Error', 'Failed to load return')
        }
    }

    const refreshDetail = async () => {
        if (!detail) return
        setDetail(await returnsDisposalService.getCustomerReturn(detail.id))
        fetchList()
    }

    const run = async (label: string, fn: () => Promise<unknown>) => {
        try {
            await fn()
            pushToast('success', label, 'Done')
            await refreshDetail()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const detailLineColumns = useMemo<ColumnDef<CustomerReturnLine>[]>(
        () => [
            {
                header: 'Material',
                size: 140,
                cell: ({ row }) => {
                    const label = row.original.material
                        ? row.original.material.materialCode
                        : row.original.materialId
                    return <span className="block truncate" title={label}>{label}</span>
                },
            },
            { header: 'Qty', size: 64, cell: ({ row }) => Number(row.original.quantity) },
            {
                header: 'Disposition',
                size: 140,
                cell: ({ row }) => (
                    <Select
                        size="sm"
                        isDisabled={
                            !detail ||
                            !['INSPECTION', 'PENDING_APPROVAL', 'APPROVED'].includes(detail.status) ||
                            row.original.dispositionStatus === 'POSTED' ||
                            row.original.dispositionStatus === 'LINKED_DISPOSAL'
                        }
                        options={DISPOSITION_OPTS}
                        value={DISPOSITION_OPTS.find((o) => o.value === row.original.disposition) ?? null}
                        onChange={async (o: { value?: string } | null) => {
                            if (!o?.value) return
                            try {
                                await returnsDisposalService.setDisposition(row.original.id, o.value)
                                await refreshDetail()
                            } catch (e: unknown) {
                                const err = e as { response?: { data?: { message?: string } }; message?: string }
                                pushToast('danger', 'Failed', err?.response?.data?.message ?? err.message ?? 'Failed')
                            }
                        }}
                    />
                ),
            },
            {
                header: 'Disp. status',
                size: 110,
                cell: ({ row }) => (
                    <span className="block truncate" title={row.original.dispositionStatus}>
                        {row.original.dispositionStatus}
                    </span>
                ),
            },
        ],
        [detail],
    )

    const columns: ColumnDef<CustomerReturn>[] = useMemo(
        () => [
            { header: 'Return #', accessorKey: 'returnNumber' },
            {
                header: 'Customer',
                cell: ({ row }) =>
                    row.original.customerName || row.original.customerRef || '—',
            },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.name ?? '—',
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
                header: 'Qty',
                cell: ({ row }) => Number(row.original.totalQuantity),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) => (
                    <Button size="xs" onClick={() => openDetail(row.original.id)}>
                        Open
                    </Button>
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Customer Return Intake"
                description="Intake → inspection → disposition (RESTOCK / REPAIR / BLOCK / SCRAP)."
                icon={<HiOutlineReply />}
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={openCreate}
                    >
                        New Return
                    </Button>
                }
            />

            <AdaptiveCard>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Select<FilterOption>
                        placeholder="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)}
                        onChange={(opt) => {
                            setStatusFilter(opt?.value ?? '')
                            setPage(1)
                        }}
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    pagingData={{ total, pageIndex: page, pageSize }}
                    onPaginationChange={setPage}
                    onSelectChange={setPageSize}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                size="lg"
                title="New customer return"
                description="Create a draft return for intake and inspection."
                icon={<HiOutlineReply />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={creating} onClick={handleCreate}>
                            Create
                        </Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Warehouse" className="sm:col-span-2">
                        <Select
                            placeholder="Select warehouse"
                            options={warehouseOpts}
                            value={warehouseOpts.find((o) => o.value === createForm.warehouseId)}
                            onChange={(o: { value?: string } | null) =>
                                setCreateForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Customer name">
                        <Input
                            value={createForm.customerName}
                            onChange={(e) =>
                                setCreateForm((f) => ({ ...f, customerName: e.target.value }))
                            }
                            placeholder="Optional"
                        />
                    </FormItem>
                    <FormItem label="Customer ref">
                        <Input
                            value={createForm.customerRef}
                            onChange={(e) =>
                                setCreateForm((f) => ({ ...f, customerRef: e.target.value }))
                            }
                            placeholder="Order / RMA #"
                        />
                    </FormItem>
                    <FormItem label="Reason" className="sm:col-span-2">
                        <Input
                            textArea
                            value={createForm.reason}
                            onChange={(e) =>
                                setCreateForm((f) => ({ ...f, reason: e.target.value }))
                            }
                            placeholder="Why is the customer returning?"
                        />
                    </FormItem>
                </div>
                <h6 className="mt-4 mb-3 text-sm font-semibold heading-text">Return line</h6>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <FormItem label="Material" className="sm:col-span-3">
                        <Select
                            placeholder="Select material"
                            options={materialOpts}
                            value={materialOpts.find((o) => o.value === createLine.materialId)}
                            onChange={(o: { value?: string } | null) =>
                                setCreateLine((l) => ({ ...l, materialId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Quantity">
                        <Input
                            type="number"
                            min={1}
                            value={createLine.quantity}
                            onChange={(e) =>
                                setCreateLine((l) => ({
                                    ...l,
                                    quantity: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Unit cost" className="sm:col-span-2">
                        <Input
                            type="number"
                            min={0}
                            value={createLine.unitCost}
                            onChange={(e) =>
                                setCreateLine((l) => ({
                                    ...l,
                                    unitCost: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail ? `Return ${detail.returnNumber}` : 'Detail'}
                size="xl"
                icon={<HiOutlineReply />}
                headerExtra={
                    detail ? (
                        <StatusBadge tone={STATUS_TONE[detail.status] ?? 'default'}>
                            {detail.status}
                        </StatusBadge>
                    ) : undefined
                }
                bodyClassName="overflow-x-hidden"
                footerClassName="!justify-between"
                footer={
                    detail ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {detail.status === 'DRAFT' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() =>
                                            run('Intake', () =>
                                                returnsDisposalService.startIntake(detail.id),
                                            )
                                        }
                                    >
                                        Start Intake
                                    </Button>
                                )}
                                {detail.status === 'INTAKE' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() =>
                                            run('Inspection', () =>
                                                returnsDisposalService.startInspection(detail.id),
                                            )
                                        }
                                    >
                                        Start Inspection
                                    </Button>
                                )}
                                {detail.status === 'INSPECTION' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() =>
                                            run('Submit', () =>
                                                returnsDisposalService.submitCustomerReturn(detail.id),
                                            )
                                        }
                                    >
                                        Submit
                                    </Button>
                                )}
                                {detail.status === 'PENDING_APPROVAL' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            onClick={() =>
                                                run('Approve', () =>
                                                    returnsDisposalService.approveCustomerReturn(detail.id),
                                                )
                                            }
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                run('Reject', () =>
                                                    returnsDisposalService.rejectCustomerReturn(
                                                        detail.id,
                                                        undefined,
                                                        'Rejected',
                                                    ),
                                                )
                                            }
                                        >
                                            Reject
                                        </Button>
                                    </>
                                )}
                                {detail.status === 'APPROVED' && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() =>
                                            run('Complete', () =>
                                                returnsDisposalService.completeCustomerReturn(detail.id),
                                            )
                                        }
                                    >
                                        Complete dispositions
                                    </Button>
                                )}
                                {detail.status === 'COMPLETED' && (
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            run('Reverse', () =>
                                                returnsDisposalService.reverseCustomerReturn(detail.id),
                                            )
                                        }
                                    >
                                        Reverse
                                    </Button>
                                )}
                            </div>
                            <Button size="sm" onClick={() => setDetail(null)}>Close</Button>
                        </>
                    ) : null
                }
            >
                {detail ? (
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <InfoCard label="Customer" value={detail.customerName || detail.customerRef || 'Walk-in'} />
                            <InfoCard label="Warehouse" value={detail.warehouse?.name} />
                            <InfoCard label="Quantity" value={String(Number(detail.totalQuantity))} />
                        </div>
                        {detail.reason ? (
                            <AdaptiveCard className="!p-3">
                                <p className="text-xs text-gray-500">Reason</p>
                                <p className="mt-0.5 text-sm">{detail.reason}</p>
                            </AdaptiveCard>
                        ) : null}
                        <div>
                            <h6 className="mb-3 text-sm font-semibold heading-text">Return lines</h6>
                            <DataTable
                                columns={detailLineColumns}
                                data={detail.lines ?? []}
                                compact
                                fit
                                hidePagination
                                noData={(detail.lines ?? []).length === 0}
                            />
                        </div>
                    </div>
                ) : null}
            </FormDialog>
        </PageContainer>
    )
}

export default CustomerReturnIntakePage
