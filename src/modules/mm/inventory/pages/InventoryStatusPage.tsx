'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import InventoryResponsiveTable, { type ColumnDef } from '../components/InventoryResponsiveTable'
import { InvPlainCell, InvQtyCell } from '../components/inventoryTableUi'
import { inventoryParentBreadcrumbs } from '../utils/inventoryPageUi'
import { SmEntityCell } from '@/modules/mm/supplier-management/components/SupplierTableCells'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineCube,
    HiOutlineLockClosed,
    HiOutlineCheckCircle,
} from 'react-icons/hi'
import {
    inventoryService,
    type BalanceSummary,
    type InventoryBalance,
} from '../services/inventoryService'
import { useDeferredFilterRefs, useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { StockStatusTag } from '../utils/inventoryUi'

const ROUTE = '/modules/mm/inventory-management/inventory-status'

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const InventoryStatusPage = () => {
    const parentBreadcrumbs = inventoryParentBreadcrumbs(ROUTE)
    const { companies, warehouses, materials, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
        'materials',
    )
    const { ensure: ensureFormRefs } = useLazyMmRefs()
    const [statusOpts, setStatusOpts] = useState<Opt[]>([
        { value: '', label: 'All statuses' },
    ])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [stockStatus, setStockStatus] = useState('')
    const [summary, setSummary] = useState<BalanceSummary | null>(null)
    const [rows, setRows] = useState<InventoryBalance[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 })
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)

    const [changeOpen, setChangeOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [changeForm, setChangeForm] = useState({
        companyId: '',
        warehouseId: '',
        materialId: '',
        fromStatus: 'UNRESTRICTED',
        toStatus: 'BLOCKED',
        quantity: 1,
        uomId: '',
        postingDate: new Date().toISOString().slice(0, 10),
        documentDate: new Date().toISOString().slice(0, 10),
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = {
                companyId: companyId || undefined,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                stockStatus: stockStatus || undefined,
            }
            const [res, sum] = await Promise.all([
                inventoryService.balances({ ...params, page, limit: 50 }),
                inventoryService.balanceSummary(params),
            ])
            setRows(res.data)
            setSummary(sum)
            setMeta({
                total: res.meta.total,
                page: res.meta.page,
                limit: res.meta.limit,
            })
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, materialId, stockStatus, page])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => {
            loadFilterRefs()
            inventoryService
                .stockStatuses()
                .then((statuses) => {
                    setStatusOpts([
                        { value: '', label: 'All statuses' },
                        ...(statuses ?? []).map((s: { code: string }) => ({
                            value: s.code,
                            label: s.code.replace(/_/g, ' '),
                        })),
                    ])
                })
                .catch(() => undefined)
        }, 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    const openStatusChange = useCallback(async () => {
        await ensureFormRefs('companies', 'warehouses', 'materials')
        setChangeOpen(true)
    }, [ensureFormRefs])

    const submitStatusChange = async () => {
        const mat = materials.find((m) => m.value === changeForm.materialId)
        const baseUomId = (mat?.meta as { baseUomId?: string } | undefined)?.baseUomId
        if (!changeForm.companyId || !changeForm.warehouseId || !changeForm.materialId) {
            pushToast('danger', 'Required', 'Company, warehouse, and material are required')
            return
        }
        setSubmitting(true)
        try {
            await inventoryService.postStatusChange({
                ...changeForm,
                uomId: changeForm.uomId || baseUomId || '',
                sourceModule: 'INVENTORY',
                sourceDocumentType: 'STATUS_CHANGE',
                sourceDocumentId: `sc-${Date.now()}`,
            })
            pushToast('success', 'Posted', 'Stock status change posted to ledger')
            setChangeOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
        }
    }

    const columns: ColumnDef<InventoryBalance>[] = useMemo(
        () => [
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
                header: 'Status',
                cell: ({ row }) => (
                    <StockStatusTag status={row.original.stockStatus} />
                ),
            },
            {
                header: 'Location',
                cell: ({ row }) => (
                    <div className="min-w-[8rem]">
                        <InvPlainCell>
                            {row.original.warehouse?.code ??
                                row.original.warehouseId.slice(0, 8)}
                        </InvPlainCell>
                        <InvPlainCell mono muted>
                            {row.original.storageBin?.code ?? 'No bin'}
                        </InvPlainCell>
                    </div>
                ),
            },
            {
                header: 'Quantity',
                cell: ({ row }) => (
                    <InvQtyCell value={Number(row.original.quantity ?? 0)} />
                ),
            },
            {
                header: 'Available',
                cell: ({ row }) => (
                    <InvQtyCell value={Number(row.original.availableQuantity ?? 0)} />
                ),
            },
        ],
        [],
    )

    const statusCodes = statusOpts.filter((o) => o.value)

    const labelOf = (opts: Opt[], value: string) =>
        opts.find((o) => o.value === value)?.label ?? value

    const chips = useMemo<FilterChip[]>(() => {
        const list: FilterChip[] = []
        if (companyId)
            list.push({
                key: 'companyId',
                label: `Company: ${labelOf(companies, companyId)}`,
                onRemove: () => {
                    setCompanyId('')
                    setWarehouseId('')
                    setMaterialId('')
                },
            })
        if (warehouseId)
            list.push({
                key: 'warehouseId',
                label: `Warehouse: ${labelOf(warehouses, warehouseId)}`,
                onRemove: () => setWarehouseId(''),
            })
        if (materialId)
            list.push({
                key: 'materialId',
                label: `Material: ${labelOf(materials, materialId)}`,
                onRemove: () => setMaterialId(''),
            })
        if (stockStatus)
            list.push({
                key: 'stockStatus',
                label: `Status: ${labelOf(statusOpts, stockStatus)}`,
                onRemove: () => setStockStatus(''),
            })
        return list
    }, [
        companyId,
        warehouseId,
        materialId,
        stockStatus,
        companies,
        warehouses,
        materials,
        statusOpts,
    ])

    const fields = useMemo<FilterField[]>(
        () => [
            {
                key: 'companyId',
                label: 'Company',
                value: companyId,
                options: companies,
                onChange: (value) => {
                    setCompanyId(value)
                    setPage(1)
                },
            },
            {
                key: 'warehouseId',
                label: 'Warehouse',
                value: warehouseId,
                options: warehouses,
                onChange: (value) => {
                    setWarehouseId(value)
                    setPage(1)
                },
            },
            {
                key: 'materialId',
                label: 'Material',
                value: materialId,
                options: materials,
                onChange: (value) => {
                    setMaterialId(value)
                    setPage(1)
                },
            },
            {
                key: 'stockStatus',
                label: 'Stock status',
                value: stockStatus,
                options: statusOpts,
                onChange: (value) => {
                    setStockStatus(value)
                    setPage(1)
                },
            },
        ],
        [companyId, warehouseId, materialId, stockStatus, companies, warehouses, materials, statusOpts],
    )

    const byStatus = summary?.byStatus ?? []
    const onHand = summary?.onHand ?? 0
    const restricted = summary?.restricted ?? 0
    const available = summary?.available ?? 0

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Inventory Status"
                description="Balances by stock status. Post status changes through the ledger engine."
                actions={
                    <>
                        <Button
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={openStatusChange}
                        >
                            Status Change
                        </Button>
                    </>
                }
            />

            <FilterBar
                className="mb-4"
                fields={fields}
                chips={chips}
                onClear={() => {
                    setCompanyId('')
                    setWarehouseId('')
                    setMaterialId('')
                    setStockStatus('')
                    setPage(1)
                }}
            />

            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="On hand"
                    value={onHand.toLocaleString()}
                    tone="info"
                    icon={<HiOutlineCube />}
                />
                <StatCard
                    label="Available"
                    value={available.toLocaleString()}
                    tone="success"
                    icon={<HiOutlineCheckCircle />}
                />
                <StatCard
                    label="Restricted"
                    value={restricted.toLocaleString()}
                    tone="danger"
                    icon={<HiOutlineLockClosed />}
                />
                <StatCard
                    label="Balance rows"
                    value={summary?.rowCount?.toLocaleString() ?? '0'}
                    tone="default"
                    icon={<HiOutlineCube />}
                />
            </div>

            {byStatus.length > 0 ? (
                <div className="mb-4 flex flex-wrap gap-2">
                    {byStatus.map((s) => (
                        <span
                            key={s.status}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                        >
                            {s.status.replace(/_/g, ' ')}
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {s.quantity.toLocaleString()}
                            </span>
                            <span className="text-gray-400">
                                · {s.rowCount} rows
                            </span>
                        </span>
                    ))}
                </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {meta.total} balance row{meta.total === 1 ? '' : 's'} in scope
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
                    getRowId={(row, index) =>
                        `${row.materialId}-${row.warehouseId}-${row.storageBinId ?? index}`
                    }
                    noData={rows.length === 0}
                    pagingData={{
                        total: meta.total,
                        pageIndex: page,
                        pageSize: meta.limit,
                    }}
                    onPaginationChange={setPage}
                    tableMinWidthClass="min-w-[880px]"
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={changeOpen}
                onClose={() => setChangeOpen(false)}
                title="Post Status Change"
                footer={
                    <>
                        <Button size="sm" onClick={() => setChangeOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submitStatusChange}
                        >
                            Post
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === changeForm.companyId)}
                            onChange={(o: any) =>
                                setChangeForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === changeForm.warehouseId)}
                            onChange={(o: any) =>
                                setChangeForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            options={materials}
                            value={materials.find((o) => o.value === changeForm.materialId)}
                            onChange={(o: any) => {
                                const mat = materials.find((m) => m.value === o?.value) as Opt & {
                                    uomId?: string
                                }
                                setChangeForm((f) => ({
                                    ...f,
                                    materialId: o?.value ?? '',
                                    uomId: mat?.uomId ?? f.uomId,
                                }))
                            }}
                        />
                    </FormItem>
                    <div className="grid grid-cols-2 gap-3">
                        <FormItem label="From status">
                            <Select
                                options={statusCodes}
                                value={statusCodes.find((o) => o.value === changeForm.fromStatus)}
                                onChange={(o: any) =>
                                    setChangeForm((f) => ({ ...f, fromStatus: o?.value ?? '' }))
                                }
                            />
                        </FormItem>
                        <FormItem label="To status">
                            <Select
                                options={statusCodes}
                                value={statusCodes.find((o) => o.value === changeForm.toStatus)}
                                onChange={(o: any) =>
                                    setChangeForm((f) => ({ ...f, toStatus: o?.value ?? '' }))
                                }
                            />
                        </FormItem>
                    </div>
                    <FormItem label="Quantity">
                        <Input
                            type="number"
                            min={0.000001}
                            value={changeForm.quantity}
                            onChange={(e) =>
                                setChangeForm((f) => ({
                                    ...f,
                                    quantity: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default InventoryStatusPage
