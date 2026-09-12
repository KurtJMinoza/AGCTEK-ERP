'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineRefresh } from 'react-icons/hi'
import {
    inventoryService,
    type BalanceSummary,
    type InventoryBalance,
} from '../services/inventoryService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { materialService } from '../../material-master/services/materialService'
import { orgService } from '../../material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

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

function n(v: string | number | undefined) {
    return Number(v ?? 0)
}

const InventoryStatusPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [statusOpts, setStatusOpts] = useState<Opt[]>([{ value: '', label: 'All statuses' }])
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

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 200 }),
            materialService.list({ limit: 200 }),
            inventoryService.stockStatuses(),
        ])
            .then(([cos, wh, mats, statuses]: any[]) => {
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
                        uomId: m.baseUomId,
                    })),
                )
                setStatusOpts([
                    { value: '', label: 'All statuses' },
                    ...(statuses ?? []).map((s: { code: string }) => ({
                        value: s.code,
                        label: s.code.replace(/_/g, ' '),
                    })),
                ])
            })
            .catch(() => undefined)
    }, [])

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
    }, [load])

    const submitStatusChange = async () => {
        const mat = materials.find((m) => m.value === changeForm.materialId) as Opt & {
            uomId?: string
        }
        if (!changeForm.companyId || !changeForm.warehouseId || !changeForm.materialId) {
            pushToast('danger', 'Required', 'Company, warehouse, and material are required')
            return
        }
        setSubmitting(true)
        try {
            await inventoryService.postStatusChange({
                ...changeForm,
                uomId: changeForm.uomId || mat?.uomId || '',
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

    const statusCodes = statusOpts.filter((o) => o.value)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
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
                            onClick={() => setChangeOpen(true)}
                        >
                            Status Change
                        </Button>
                    </>
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
                            options={statusOpts}
                            value={statusOpts.find((o) => o.value === stockStatus)}
                            onChange={(o: any) => {
                                setStockStatus(o?.value ?? '')
                                setPage(1)
                            }}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>

            {summary && summary.byStatus.length > 0 && (
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4 mb-4">
                    {summary.byStatus.map((s) => (
                        <AdaptiveCard key={s.status}>
                            <div className="text-sm text-gray-500">{s.status}</div>
                            <div className="text-2xl font-semibold mt-1">
                                {s.quantity.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{s.rowCount} balance rows</div>
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
