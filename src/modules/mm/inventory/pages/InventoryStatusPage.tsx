'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    inventoryService,
    type InventoryBalance,
} from '../services/inventoryService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/inventory-status'

const STATUS_OPTS = [
    { value: '', label: 'All statuses' },
    { value: 'UNRESTRICTED', label: 'Unrestricted' },
    { value: 'QUALITY_INSPECTION', label: 'Quality inspection' },
    { value: 'BLOCKED', label: 'Blocked' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'IN_TRANSIT', label: 'In transit' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'DAMAGED', label: 'Damaged' },
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

function n(v: string | number | undefined) {
    return Number(v ?? 0)
}

const InventoryStatusPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [stockStatus, setStockStatus] = useState('')
    const [rows, setRows] = useState<InventoryBalance[]>([])
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 })
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
        ])
            .then(([cos, wh, mats]: any[]) => {
                setCompanies(
                    (Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.name || c.code,
                    })),
                )
                setWarehouses(
                    (wh?.data ?? []).map((w: any) => ({
                        value: w.id,
                        label: `${w.code} — ${w.name}`,
                    })),
                )
                setMaterials(
                    (mats?.data ?? []).map((m: any) => ({
                        value: m.id,
                        label: `${m.materialCode} — ${m.materialName}`,
                    })),
                )
            })
            .catch(() => undefined)
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryService.balances({
                companyId: companyId || undefined,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                stockStatus: stockStatus || undefined,
                page,
                limit: 50,
            })
            setRows(res.data)
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
    }, [load])

    const byStatus = useMemo(() => {
        const map = new Map<string, number>()
        for (const r of rows) {
            map.set(r.stockStatus, (map.get(r.stockStatus) ?? 0) + n(r.quantity))
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }, [rows])

    const columns: ColumnDef<InventoryBalance>[] = useMemo(
        () => [
            { header: 'Status', accessorKey: 'stockStatus' },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ??
                    row.original.materialId.slice(0, 8),
            },
            {
                header: 'Warehouse',
                cell: ({ row }) =>
                    row.original.warehouse?.name ??
                    row.original.warehouseId.slice(0, 8),
            },
            {
                header: 'Bin',
                cell: ({ row }) => row.original.storageBin?.code ?? '—',
            },
            {
                header: 'Quantity',
                cell: ({ row }) => n(row.original.quantity),
            },
            {
                header: 'Available',
                cell: ({ row }) => n(row.original.availableQuantity),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Status"
                description="Balances grouped and filtered by stock status (unrestricted, QI, blocked, in transit, …)."
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

            <AdaptiveCard className="mb-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <FormItem label="Company">
                        <Select
                            isClearable
                            options={companies}
                            value={companies.find((o) => o.value === companyId) ?? null}
                            onChange={(o: any) => {
                                setCompanyId(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            options={warehouses}
                            value={warehouses.find((o) => o.value === warehouseId) ?? null}
                            onChange={(o: any) => {
                                setWarehouseId(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            isClearable
                            options={materials}
                            value={materials.find((o) => o.value === materialId) ?? null}
                            onChange={(o: any) => {
                                setMaterialId(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                    <FormItem label="Stock status">
                        <Select
                            options={STATUS_OPTS}
                            value={STATUS_OPTS.find((o) => o.value === stockStatus)}
                            onChange={(o: any) => {
                                setStockStatus(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            {byStatus.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 mb-4">
                    {byStatus.map(([status, qty]) => (
                        <AdaptiveCard key={status}>
                            <div className="text-sm text-gray-500">{status}</div>
                            <div className="text-2xl font-semibold mt-1">
                                {qty.toLocaleString()}
                            </div>
                        </AdaptiveCard>
                    ))}
                </div>
            )}

            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
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

export default InventoryStatusPage
