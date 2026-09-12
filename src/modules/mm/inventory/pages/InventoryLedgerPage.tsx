'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    inventoryService,
    type InventoryTransaction,
} from '../services/inventoryService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/inventory-ledger'

const REVERSAL_OPTS = [
    { value: 'all', label: 'All postings' },
    { value: 'original', label: 'Original only' },
    { value: 'reversals', label: 'Reversals only' },
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

const InventoryLedgerPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [reversalFilter, setReversalFilter] = useState<'all' | 'original' | 'reversals'>(
        'all',
    )
    const [rows, setRows] = useState<InventoryTransaction[]>([])
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
            const res = await inventoryService.ledger({
                companyId: companyId || undefined,
                warehouseId: warehouseId || undefined,
                materialId: materialId || undefined,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
                reversalFilter,
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
    }, [companyId, warehouseId, materialId, fromDate, toDate, reversalFilter, page])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<InventoryTransaction>[] = useMemo(
        () => [
            { header: 'Txn #', accessorKey: 'transactionNumber' },
            {
                header: 'Posting date',
                cell: ({ row }) =>
                    new Date(row.original.postingDate).toLocaleDateString(),
            },
            { header: 'Movement', accessorKey: 'movementType' },
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
            { header: 'Status', accessorKey: 'stockStatus' },
            {
                header: 'Base qty',
                cell: ({ row }) =>
                    n(row.original.baseQuantity ?? Math.abs(n(row.original.quantity))),
            },
            {
                header: 'Signed qty',
                cell: ({ row }) => n(row.original.signedQuantity ?? row.original.quantity),
            },
            {
                header: 'Source',
                cell: ({ row }) =>
                    row.original.sourceDocumentType && row.original.sourceDocumentId
                        ? `${row.original.sourceDocumentType}:${row.original.sourceDocumentId.slice(0, 8)}`
                        : '—',
            },
            {
                header: 'Reversal of',
                cell: ({ row }) =>
                    row.original.reversalOfId
                        ? row.original.reversalOfId.slice(0, 8)
                        : '—',
            },
            {
                header: 'Idempotency',
                cell: ({ row }) => row.original.idempotencyKey?.slice(0, 10) ?? '—',
            },
            {
                header: 'Performed by',
                cell: ({ row }) => row.original.createdBy ?? '—',
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Inventory Ledger"
                description="Immutable ledger of inventory transactions with base and signed quantities."
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
                <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
                    <FormItem label="From">
                        <Input
                            type="date"
                            value={fromDate}
                            onChange={(e) => {
                                setFromDate(e.target.value)
                                setPage(1)
                            }}
                        />
                    </FormItem>
                    <FormItem label="To">
                        <Input
                            type="date"
                            value={toDate}
                            onChange={(e) => {
                                setToDate(e.target.value)
                                setPage(1)
                            }}
                        />
                    </FormItem>
                    <FormItem label="Reversals">
                        <Select
                            options={REVERSAL_OPTS}
                            value={REVERSAL_OPTS.find((o) => o.value === reversalFilter)}
                            onChange={(o: any) => {
                                setReversalFilter(o?.value ?? 'all')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

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

export default InventoryLedgerPage
