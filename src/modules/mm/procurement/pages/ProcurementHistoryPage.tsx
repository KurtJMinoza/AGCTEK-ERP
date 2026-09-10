'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineSearch } from 'react-icons/hi'
import {
    procurementHistoryService,
    type ProcurementHistoryRow,
} from '../services/procurementHistoryService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { materialService } from '@/modules/mm/material-master/services/materialService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/procurement/procurement-history'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const ProcurementHistoryPage = () => {
    const router = useRouter()
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<ProcurementHistoryRow[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [suppliers, setSuppliers] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<Opt[]>([])
    const [filters, setFilters] = useState({
        companyId: '',
        supplierId: '',
        materialId: '',
        buyerId: '',
        poNumber: '',
        dateFrom: '',
        dateTo: '',
        minPrice: '',
        maxPrice: '',
        minQty: '',
        maxQty: '',
    })

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            supplierService.list({ page: 1, pageSize: 200 }),
            materialService.list({ page: 1, limit: 200 } as never),
        ]).then(([cos, sup, mats]: any[]) => {
            const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map(
                (x: any) => ({ value: x.id, label: x.name || x.code }),
            )
            setCompanies(c)
            setSuppliers(
                (sup?.data ?? []).map((s: any) => ({
                    value: s.id,
                    label: `${s.supplierCode} — ${s.supplierName}`,
                })),
            )
            setMaterials(
                (mats?.data ?? mats ?? []).map((m: any) => ({
                    value: m.id,
                    label: `${m.materialCode} — ${m.materialName}`,
                })),
            )
            if (c[0]) setFilters((p) => ({ ...p, companyId: c[0].value }))
        })
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await procurementHistoryService.search({
                companyId: filters.companyId || undefined,
                supplierId: filters.supplierId || undefined,
                materialId: filters.materialId || undefined,
                buyerId: filters.buyerId || undefined,
                poNumber: filters.poNumber || undefined,
                dateFrom: filters.dateFrom || undefined,
                dateTo: filters.dateTo || undefined,
                minPrice: filters.minPrice
                    ? Number(filters.minPrice)
                    : undefined,
                maxPrice: filters.maxPrice
                    ? Number(filters.maxPrice)
                    : undefined,
                minQty: filters.minQty ? Number(filters.minQty) : undefined,
                maxQty: filters.maxQty ? Number(filters.maxQty) : undefined,
                pageSize: 100,
            })
            setRows(res.data)
            setTotal(res.meta.total)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Search failed')
        } finally {
            setLoading(false)
        }
    }, [filters])

    useEffect(() => {
        if (filters.companyId) load()
    }, [filters.companyId]) // eslint-disable-line react-hooks/exhaustive-deps

    const columns: ColumnDef<ProcurementHistoryRow>[] = useMemo(
        () => [
            {
                header: 'PO',
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="font-mono text-sm text-primary hover:underline"
                        onClick={() =>
                            router.push(
                                `/modules/mm/procurement/purchase-orders/${row.original.poId}`,
                            )
                        }
                    >
                        {row.original.poNumber}
                    </button>
                ),
            },
            {
                header: 'Date',
                cell: ({ row }) =>
                    String(row.original.date).slice(0, 10),
            },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier?.supplierCode ?? '—',
            },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ?? '—',
            },
            {
                header: 'Qty',
                cell: ({ row }) => row.original.quantity,
            },
            {
                header: 'Price',
                cell: ({ row }) => row.original.unitPrice.toFixed(2),
            },
            {
                header: 'Buyer',
                cell: ({ row }) => row.original.buyerId,
            },
            {
                header: 'Status',
                cell: ({ row }) => row.original.poStatus,
            },
        ],
        [router],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Procurement History"
                description="Searchable PO line history by supplier, material, price, quantity, buyer, date, and PO"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={
                                companies.find(
                                    (c) => c.value === filters.companyId,
                                ) ?? null
                            }
                            onChange={(o: any) =>
                                setFilters((p) => ({
                                    ...p,
                                    companyId: o?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Supplier">
                        <Select
                            options={suppliers}
                            value={
                                suppliers.find(
                                    (s) => s.value === filters.supplierId,
                                ) ?? null
                            }
                            onChange={(o: any) =>
                                setFilters((p) => ({
                                    ...p,
                                    supplierId: o?.value ?? '',
                                }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            options={materials}
                            value={
                                materials.find(
                                    (m) => m.value === filters.materialId,
                                ) ?? null
                            }
                            onChange={(o: any) =>
                                setFilters((p) => ({
                                    ...p,
                                    materialId: o?.value ?? '',
                                }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="PO number">
                        <Input
                            value={filters.poNumber}
                            onChange={(e) =>
                                setFilters((p) => ({
                                    ...p,
                                    poNumber: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Buyer">
                        <Input
                            value={filters.buyerId}
                            onChange={(e) =>
                                setFilters((p) => ({
                                    ...p,
                                    buyerId: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Date from">
                        <Input
                            type="date"
                            value={filters.dateFrom}
                            onChange={(e) =>
                                setFilters((p) => ({
                                    ...p,
                                    dateFrom: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Date to">
                        <Input
                            type="date"
                            value={filters.dateTo}
                            onChange={(e) =>
                                setFilters((p) => ({
                                    ...p,
                                    dateTo: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Min / max price">
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                placeholder="Min"
                                value={filters.minPrice}
                                onChange={(e) =>
                                    setFilters((p) => ({
                                        ...p,
                                        minPrice: e.target.value,
                                    }))
                                }
                            />
                            <Input
                                type="number"
                                placeholder="Max"
                                value={filters.maxPrice}
                                onChange={(e) =>
                                    setFilters((p) => ({
                                        ...p,
                                        maxPrice: e.target.value,
                                    }))
                                }
                            />
                        </div>
                    </FormItem>
                    <FormItem label="Min / max qty">
                        <div className="flex gap-2">
                            <Input
                                type="number"
                                placeholder="Min"
                                value={filters.minQty}
                                onChange={(e) =>
                                    setFilters((p) => ({
                                        ...p,
                                        minQty: e.target.value,
                                    }))
                                }
                            />
                            <Input
                                type="number"
                                placeholder="Max"
                                value={filters.maxQty}
                                onChange={(e) =>
                                    setFilters((p) => ({
                                        ...p,
                                        maxQty: e.target.value,
                                    }))
                                }
                            />
                        </div>
                    </FormItem>
                </div>
                <div className="mt-3">
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlineSearch />}
                        onClick={load}
                        loading={loading}
                    >
                        Search ({total})
                    </Button>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default ProcurementHistoryPage
