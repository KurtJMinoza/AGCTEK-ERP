'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineRefresh,
    HiOutlineArrowDown,
    HiOutlineArrowUp,
    HiOutlineReply,
    HiOutlineClipboardList,
} from 'react-icons/hi'
import {
    inventoryService,
    type InventoryTransaction,
} from '../services/inventoryService'
import { useDeferredFilterRefs } from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { buildTransactionColumns } from '../utils/ledgerColumns'

const ROUTE = '/modules/mm/inventory-management/stock-movements'

const MOVEMENT_OPTS = [
    { value: '', label: 'All movements' },
    { value: 'RECEIPT', label: 'Receipt' },
    { value: 'ISSUE', label: 'Issue' },
    { value: 'TRANSFER_IN', label: 'Transfer in' },
    { value: 'TRANSFER_OUT', label: 'Transfer out' },
    { value: 'ADJUSTMENT_IN', label: 'Adjustment in' },
    { value: 'ADJUSTMENT_OUT', label: 'Adjustment out' },
    { value: 'RETURN_IN', label: 'Return in' },
    { value: 'RETURN_OUT', label: 'Return out' },
    { value: 'SCRAP', label: 'Scrap' },
    { value: 'COUNT_GAIN', label: 'Count gain' },
    { value: 'COUNT_LOSS', label: 'Count loss' },
]

type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const StockMovementsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, warehouses, materials, loadFilterRefs } = useDeferredFilterRefs(
        'companies',
        'warehouses',
        'materials',
    )
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [movementType, setMovementType] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [rows, setRows] = useState<InventoryTransaction[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 })
    const [summary, setSummary] = useState({
        total: 0,
        inboundQuantity: 0,
        outboundQuantity: 0,
        reversals: 0,
    })
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryService.ledger({
                companyId: companyId || undefined,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                movementType: movementType || undefined,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
                page,
                limit: 50,
            })
            setRows(res.data)
            setMeta({
                total: res.meta.total,
                page: res.meta.page,
                limit: res.meta.limit,
            })
            setSummary(
                res.summary ?? {
                    total: res.meta.total,
                    inboundQuantity: 0,
                    outboundQuantity: 0,
                    reversals: 0,
                },
            )
        } catch (e: unknown) {
            const err = e as {
                response?: { data?: { message?: string } }
                message?: string
            }
            pushToast(
                'danger',
                'Load failed',
                err?.response?.data?.message ??
                    err?.message ??
                    'Unknown error',
            )
        } finally {
            setLoading(false)
        }
    }, [companyId, warehouseId, materialId, movementType, fromDate, toDate, page])

    useEffect(() => {
        load()
        const t = window.setTimeout(() => loadFilterRefs(), 0)
        return () => window.clearTimeout(t)
    }, [load, loadFilterRefs])

    // Only warehouses of the selected company.
    const warehouseOptions = useMemo(
        () =>
            warehouses.filter((w) => {
                const company = (w.meta as { companyId?: string } | undefined)
                    ?.companyId
                return !companyId || !company || company === companyId
            }),
        [warehouses, companyId],
    )

    // Only materials of the selected company.
    const materialOptions = useMemo(
        () =>
            companyId
                ? materials.filter(
                      (m) =>
                          (m.meta as { companyId?: string } | undefined)
                              ?.companyId === companyId,
                  )
                : materials,
        [materials, companyId],
    )

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
                label: `Warehouse: ${labelOf(warehouseOptions, warehouseId)}`,
                onRemove: () => setWarehouseId(''),
            })
        if (materialId)
            list.push({
                key: 'materialId',
                label: `Material: ${labelOf(materialOptions, materialId)}`,
                onRemove: () => setMaterialId(''),
            })
        if (movementType)
            list.push({
                key: 'movementType',
                label: `Movement: ${labelOf(MOVEMENT_OPTS, movementType)}`,
                onRemove: () => setMovementType(''),
            })
        if (fromDate)
            list.push({
                key: 'fromDate',
                label: `From: ${fromDate}`,
                onRemove: () => setFromDate(''),
            })
        if (toDate)
            list.push({
                key: 'toDate',
                label: `To: ${toDate}`,
                onRemove: () => setToDate(''),
            })
        return list
    }, [
        companyId,
        warehouseId,
        materialId,
        movementType,
        fromDate,
        toDate,
        companies,
        warehouseOptions,
        materialOptions,
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
                    const selected = warehouses.find(
                        (w) => w.value === warehouseId,
                    )
                    const selectedCompanyId = (
                        selected?.meta as { companyId?: string } | undefined
                    )?.companyId
                    if (
                        value &&
                        selectedCompanyId &&
                        selectedCompanyId !== value
                    ) {
                        setWarehouseId('')
                    }
                    setPage(1)
                },
            },
            {
                key: 'warehouseId',
                label: 'Warehouse',
                value: warehouseId,
                options: warehouseOptions,
                onChange: (value) => {
                    setWarehouseId(value)
                    setPage(1)
                },
            },
            {
                key: 'materialId',
                label: 'Material',
                value: materialId,
                options: materialOptions,
                onChange: (value) => {
                    setMaterialId(value)
                    setPage(1)
                },
            },
            {
                key: 'movementType',
                label: 'Movement',
                value: movementType,
                options: MOVEMENT_OPTS,
                onChange: (value) => {
                    setMovementType(value)
                    setPage(1)
                },
            },
            {
                key: 'fromDate',
                label: 'From',
                kind: 'text',
                inputType: 'date',
                value: fromDate,
                onChange: (value) => {
                    setFromDate(value)
                    setPage(1)
                },
            },
            {
                key: 'toDate',
                label: 'To',
                kind: 'text',
                inputType: 'date',
                value: toDate,
                onChange: (value) => {
                    setToDate(value)
                    setPage(1)
                },
            },
        ],
        [
            companyId,
            warehouseId,
            materialId,
            movementType,
            fromDate,
            toDate,
            companies,
            warehouses,
            warehouseOptions,
            materialOptions,
        ],
    )

    const columns = useMemo(() => buildTransactionColumns(), [])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Stock Movements"
                description="Every posting that moved stock — what moved, where it came from, and who posted it."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={load}
                    >
                        Refresh
                    </Button>
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
                    setMovementType('')
                    setFromDate('')
                    setToDate('')
                    setPage(1)
                }}
            />

            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Postings in scope"
                    value={summary.total.toLocaleString()}
                    tone="info"
                    icon={<HiOutlineClipboardList />}
                />
                <StatCard
                    label="Stock in"
                    value={summary.inboundQuantity.toLocaleString()}
                    tone="success"
                    icon={<HiOutlineArrowDown />}
                />
                <StatCard
                    label="Stock out"
                    value={summary.outboundQuantity.toLocaleString()}
                    tone="danger"
                    icon={<HiOutlineArrowUp />}
                />
                <StatCard
                    label="Reversals"
                    value={summary.reversals.toLocaleString()}
                    tone="warning"
                    icon={<HiOutlineReply />}
                />
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span>
                    {meta.total} posting{meta.total === 1 ? '' : 's'} in scope
                </span>
                <span>
                    Page {meta.page} · {meta.limit} per page
                </span>
            </div>

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    compact
                    noData={rows.length === 0}
                    pagingData={{
                        total: meta.total,
                        pageIndex: page,
                        pageSize: meta.limit,
                    }}
                    onPaginationChange={setPage}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default StockMovementsPage
