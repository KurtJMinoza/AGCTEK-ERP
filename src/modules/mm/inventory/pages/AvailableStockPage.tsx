'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FilterBar, {
    type FilterChip,
    type FilterField,
} from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineCalculator,
    HiOutlineCube,
    HiOutlineArchive,
    HiOutlineCheckCircle,
} from 'react-icons/hi'
import {
    inventoryService,
    type AvailabilityResult,
} from '../services/inventoryService'
import {
    useMmFilterRefs,
    useLazyBinsForWarehouse,
} from '@/modules/mm/shared/useLazyMmRefs'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-management/available-stock'

type Opt = { value: string; label: string }

/** Stock status → tag colour. */
const STATUS_TONE: Record<string, string> = {
    UNRESTRICTED:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    RESTRICTED:
        'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    QUARANTINE:
        'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    BLOCKED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    HOLD: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    INSPECTION:
        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    DAMAGED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const fmt = (v: number) => v.toLocaleString()

const AvailableStockPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const { companies, warehouses, materials } = useMmFilterRefs(
        'companies',
        'warehouses',
        'materials',
    )
    const { loadForWarehouse, rows: binRows } = useLazyBinsForWarehouse()

    const [companyId, setCompanyId] = useState('')
    const [warehouseId, setWarehouseId] = useState('')
    const [materialId, setMaterialId] = useState('')
    const [storageBinId, setStorageBinId] = useState('')
    const [batchId, setBatchId] = useState('')
    const [serialNumberId, setSerialNumberId] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AvailabilityResult | null>(null)

    // Bins follow the chosen warehouse.
    useEffect(() => {
        void loadForWarehouse(warehouseId || '')
    }, [warehouseId, loadForWarehouse])

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

    const binOptions = useMemo<Opt[]>(
        () => binRows.map((bin) => ({ value: bin.id, label: bin.code })),
        [binRows],
    )

    const run = useCallback(async () => {
        if (!companyId || !warehouseId || !materialId) {
            pushToast(
                'danger',
                'Required',
                'Select the company, warehouse and material to calculate ATP.',
            )
            return
        }
        setLoading(true)
        try {
            const atp = await inventoryService.available({
                companyId,
                warehouseId,
                materialId,
                storageBinId: storageBinId || undefined,
                batchId: batchId || undefined,
                serialNumberId: serialNumberId || undefined,
            })
            setResult(atp)
        } catch (e: unknown) {
            const err = e as {
                response?: { data?: { message?: string } }
                message?: string
            }
            pushToast(
                'danger',
                'ATP failed',
                err?.response?.data?.message ?? err?.message ?? 'Unknown error',
            )
        } finally {
            setLoading(false)
        }
    }, [
        companyId,
        warehouseId,
        materialId,
        storageBinId,
        batchId,
        serialNumberId,
    ])

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
                onRemove: () => {
                    setWarehouseId('')
                    setStorageBinId('')
                },
            })
        if (materialId)
            list.push({
                key: 'materialId',
                label: `Material: ${labelOf(materialOptions, materialId)}`,
                onRemove: () => setMaterialId(''),
            })
        if (storageBinId)
            list.push({
                key: 'storageBinId',
                label: `Bin: ${labelOf(binOptions, storageBinId)}`,
                onRemove: () => setStorageBinId(''),
            })
        if (batchId)
            list.push({
                key: 'batchId',
                label: `Batch: ${batchId}`,
                onRemove: () => setBatchId(''),
            })
        if (serialNumberId)
            list.push({
                key: 'serialNumberId',
                label: `Serial: ${serialNumberId}`,
                onRemove: () => setSerialNumberId(''),
            })
        return list
    }, [
        companyId,
        warehouseId,
        materialId,
        storageBinId,
        batchId,
        serialNumberId,
        companies,
        warehouseOptions,
        materialOptions,
        binOptions,
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
                    const selected = warehouses.find((w) => w.value === warehouseId)
                    const selectedCompanyId = (
                        selected?.meta as { companyId?: string } | undefined
                    )?.companyId
                    if (value && selectedCompanyId && selectedCompanyId !== value) {
                        setWarehouseId('')
                        setStorageBinId('')
                    }
                },
            },
            {
                key: 'warehouseId',
                label: 'Warehouse',
                value: warehouseId,
                options: warehouseOptions,
                onChange: (value) => {
                    setWarehouseId(value)
                    setStorageBinId('')
                },
            },
            {
                key: 'materialId',
                label: 'Material',
                value: materialId,
                options: materialOptions,
                onChange: (value) => setMaterialId(value),
            },
            {
                key: 'storageBinId',
                label: 'Bin',
                value: storageBinId,
                options: binOptions,
                placeholder: 'All bins',
                onChange: (value) => setStorageBinId(value),
            },
            {
                key: 'batchId',
                label: 'Batch ID',
                kind: 'text',
                value: batchId,
                placeholder: 'Optional',
                onChange: (value) => setBatchId(value),
            },
            {
                key: 'serialNumberId',
                label: 'Serial ID',
                kind: 'text',
                value: serialNumberId,
                placeholder: 'Optional',
                onChange: (value) => setSerialNumberId(value),
            },
        ],
        [
            companyId,
            warehouseId,
            materialId,
            storageBinId,
            batchId,
            serialNumberId,
            companies,
            warehouses,
            warehouseOptions,
            materialOptions,
            binOptions,
        ],
    )

    const balanceColumns = useMemo<
        ColumnDef<AvailabilityResult['balances'][number]>[]
    >(
        () => [
            {
                header: 'Status',
                cell: ({ row }) => (
                    <Tag
                        className={
                            STATUS_TONE[row.original.stockStatus] ??
                            'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }
                    >
                        {row.original.stockStatus}
                    </Tag>
                ),
            },
            {
                header: 'Bin',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-600">
                        {row.original.storageBinId?.slice(0, 8) ?? '—'}
                    </span>
                ),
            },
            {
                header: 'On hand',
                cell: ({ row }) => (
                    <span className="font-medium text-gray-900">
                        {fmt(Number(row.original.quantity))}
                    </span>
                ),
            },
            {
                header: 'Reserved',
                cell: ({ row }) => (
                    <span
                        className={
                            Number(row.original.reservedQuantity) > 0
                                ? 'font-medium text-amber-700 dark:text-amber-300'
                                : 'text-gray-500'
                        }
                    >
                        {fmt(Number(row.original.reservedQuantity))}
                    </span>
                ),
            },
            {
                header: 'Available',
                cell: ({ row }) => {
                    const onHand = Number(row.original.quantity)
                    const available = Number(row.original.availableQuantity)
                    const pct = onHand > 0 ? (available / onHand) * 100 : 0
                    return (
                        <div className="min-w-[6rem]">
                            <div className="font-semibold text-gray-900">
                                {fmt(available)}
                            </div>
                            <Progress
                                percent={Math.round(pct)}
                                className="mt-1 h-1"
                                customColorClass="bg-emerald-500"
                            />
                        </div>
                    )
                },
            },
        ],
        [],
    )

    const reservedPct =
        result && result.onHand > 0
            ? Math.min(100, Math.round((result.reserved / result.onHand) * 100))
            : 0

    const summaryCards = useMemo(
        () => [
            {
                label: 'On hand (total)',
                value: result?.onHand ?? 0,
                tone: 'default' as const,
                icon: <HiOutlineCube className="text-xl" />,
            },
            {
                label: 'Unrestricted',
                value: result?.unrestrictedOnHand ?? 0,
                tone: 'info' as const,
                icon: <HiOutlineCheckCircle className="text-xl" />,
            },
            {
                label: 'Reserved',
                value: result?.reserved ?? 0,
                tone: 'warning' as const,
                icon: <HiOutlineArchive className="text-xl" />,
                badge: {
                    tone: 'warning' as const,
                    label: `${reservedPct}% of on hand`,
                },
            },
            {
                label: 'Restricted',
                value: result?.restricted ?? 0,
                tone: 'danger' as const,
                icon: <HiOutlineArchive className="text-xl" />,
            },
            {
                label: 'Available to promise',
                value: result?.available ?? 0,
                tone: 'success' as const,
                icon: <HiOutlineCheckCircle className="text-xl" />,
            },
        ],
        [result, reservedPct],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Available to Promise"
                description="Unrestricted − Existing Reservations − Restricted = Available. Reservations do not deduct physical inventory."
            />

            <FilterBar
                className="mb-4"
                fields={fields}
                chips={chips}
                onClear={() => {
                    setCompanyId('')
                    setWarehouseId('')
                    setMaterialId('')
                    setStorageBinId('')
                    setBatchId('')
                    setSerialNumberId('')
                    setResult(null)
                }}
                actions={
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlineCalculator />}
                        loading={loading}
                        onClick={run}
                    >
                        Calculate ATP
                    </Button>
                }
            />

            {result ? (
                <>
                    <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {summaryCards.map((card) => (
                            <StatCard
                                key={card.label}
                                label={card.label}
                                value={fmt(card.value)}
                                tone={card.tone}
                                icon={card.icon}
                                badge={card.badge}
                            />
                        ))}
                    </div>

                    <AdaptiveCard>
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900">
                                Balance detail
                            </p>
                            <span className="text-xs text-gray-500">
                                {result.balances.length} balance row
                                {result.balances.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <DataTable
                            columns={balanceColumns}
                            data={result.balances}
                            hidePagination
                        />
                    </AdaptiveCard>
                </>
            ) : (
                <AdaptiveCard>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <HiOutlineCalculator className="text-3xl text-gray-300" />
                        <p className="text-sm font-medium text-gray-700">
                            Select a company, warehouse and material
                        </p>
                        <p className="max-w-md text-xs text-gray-500">
                            ATP is calculated by the Materials Management
                            availability service — the figures are never
                            recomputed in the browser.
                        </p>
                    </div>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default AvailableStockPage
