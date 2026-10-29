'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import WarehouseResponsiveTable from '../components/WarehouseResponsiveTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import { HiOutlineCube, HiOutlineScale, HiOutlineDatabase } from 'react-icons/hi'
import { storageBinService } from '../services/storageBinService'
import type { StorageBin, BinCapacitySummary } from '../types'
import {
    WAREHOUSE_STORAGE_BINS_PATH,
    warehouseParentBreadcrumbs,
} from '../utils/warehousePageUi'

const ROUTE = '/modules/mm/warehouse-management/bin-capacity'

function binUtilizationPct(row: StorageBin): number {
    const cap = Number(row.capacityQuantity)
    const currentQty = Number(row.currentQuantity ?? 0)
    if (row.utilizationPct != null && Number.isFinite(Number(row.utilizationPct))) {
        return Math.min(Math.round(Number(row.utilizationPct)), 100)
    }
    return cap > 0 ? Math.min(Math.round((currentQty / cap) * 100), 100) : 0
}

const BinCapacityPage = () => {
    const router = useRouter()
    const parentBreadcrumbs = useMemo(() => warehouseParentBreadcrumbs(ROUTE), [])
    const [bins, setBins] = useState<StorageBin[]>([])
    const [summary, setSummary] = useState<BinCapacitySummary | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [binsRes, summaryRes] = await Promise.all([
                storageBinService.listWithOccupancy(),
                storageBinService.getCapacitySummary(),
            ])
            setBins(Array.isArray(binsRes) ? binsRes : ((binsRes as any)?.data ?? []))
            setSummary(summaryRes)
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const columns = useMemo<ColumnDef<StorageBin>[]>(() => [
        { header: 'Bin Code', accessorKey: 'code', size: 130, cell: ({ row }) => <span className="font-mono text-xs font-semibold text-primary">{row.original.code}</span> },
        { header: 'Barcode', accessorKey: 'barcode', size: 150, cell: ({ row }) => row.original.barcode ? <Tag className="font-mono text-xs">{row.original.barcode}</Tag> : <span className="text-gray-400 text-xs">—</span> },
        { header: 'Section', id: 'section', size: 110, cell: ({ row }) => row.original.storageSection?.code ?? '—' },
        { header: 'Type', id: 'type', size: 130, cell: ({ row }) => row.original.storageSection?.storageType?.name ?? '—' },
        { header: 'Warehouse', id: 'warehouse', size: 140, cell: ({ row }) => row.original.storageSection?.storageType?.warehouse?.name ?? '—' },
        {
            header: 'Qty Capacity', id: 'capQty', size: 130, cell: ({ row }) => (
                <span className="text-sm font-semibold">{Number(row.original.capacityQuantity).toLocaleString()}</span>
            ),
        },
        {
            header: 'Weight Capacity', id: 'capWeight', size: 150, cell: ({ row }) => (
                <span className="text-sm">{Number(row.original.capacityWeight).toLocaleString()} <span className="text-gray-400 text-xs">{row.original.weightUom || ''}</span></span>
            ),
        },
        {
            header: 'Volume Capacity', id: 'capVol', size: 150, cell: ({ row }) => (
                <span className="text-sm">{Number(row.original.capacityVolume).toLocaleString()} <span className="text-gray-400 text-xs">{row.original.volumeUom || ''}</span></span>
            ),
        },
        {
            header: 'Utilization', id: 'utilization', size: 160, enableSorting: false,
            cell: ({ row }) => {
                const cap = Number(row.original.capacityQuantity)
                const currentQty = (row.original as any).currentQuantity ?? 0
                const pct = cap > 0 ? Math.min(Math.round((currentQty / cap) * 100), 100) : 0
                const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                return (
                    <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress percent={pct} customColorClass={color} size="sm" className="flex-1" />
                        <span className="text-xs font-medium whitespace-nowrap">{pct}%</span>
                    </div>
                )
            },
        },
        { header: 'Pick', id: 'pick', size: 60, enableSorting: false, cell: ({ row }) => row.original.pickingAllowed ? <Tag className="bg-emerald-100 text-emerald-700 text-xs">Y</Tag> : <span className="text-gray-400 text-xs">N</span> },
        { header: 'Put', id: 'put', size: 60, enableSorting: false, cell: ({ row }) => row.original.putawayAllowed ? <Tag className="bg-blue-100 text-blue-700 text-xs">Y</Tag> : <span className="text-gray-400 text-xs">N</span> },
        { header: 'Status', accessorKey: 'status', size: 100, cell: ({ row }) => <StatusBadge tone={row.original.status === 'ACTIVE' ? 'success' : 'warning'}>{row.original.status}</StatusBadge> },
    ], [])

    const capacityMobile = useMemo(
        () => ({
            title: (row: StorageBin) => row.code,
            subtitle: (row: StorageBin) =>
                row.storageSection?.storageType?.warehouse?.name ?? row.storageSection?.code ?? undefined,
            status: (row: StorageBin) => ({
                text: `${binUtilizationPct(row)}% full`,
                tone:
                    binUtilizationPct(row) >= 90
                        ? ('danger' as const)
                        : binUtilizationPct(row) >= 70
                          ? ('warning' as const)
                          : ('success' as const),
            }),
            onPress: (row: StorageBin) => {
                router.push(
                    `${WAREHOUSE_STORAGE_BINS_PATH}?edit=${encodeURIComponent(row.id)}`,
                )
            },
            fields: [
                {
                    label: 'Section',
                    value: (row: StorageBin) => row.storageSection?.code ?? '—',
                },
                {
                    label: 'Type',
                    value: (row: StorageBin) => row.storageSection?.storageType?.name ?? '—',
                },
                {
                    label: 'Qty cap',
                    value: (row: StorageBin) => Number(row.capacityQuantity).toLocaleString(),
                },
                {
                    label: 'Weight',
                    value: (row: StorageBin) =>
                        `${Number(row.capacityWeight).toLocaleString()} ${row.weightUom || ''}`.trim(),
                },
                {
                    label: 'Volume',
                    value: (row: StorageBin) =>
                        `${Number(row.capacityVolume).toLocaleString()} ${row.volumeUom || ''}`.trim(),
                },
                {
                    label: 'Status',
                    value: (row: StorageBin) => row.status.replace(/_/g, ' '),
                },
            ],
        }),
        [router],
    )

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
                title="Bin Capacity"
                description="Overview of storage bin capacity utilization across warehouses."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard label="Total bins" value={summary?.totalBins ?? 0} icon={<HiOutlineCube className="text-lg" />} />
                <SummaryCard label="Active bins" value={summary?.activeBins ?? 0} icon={<HiOutlineDatabase className="text-lg" />} tone="success" />
                <SummaryCard label="Total qty capacity" value={summary?.totalCapacityQty ?? summary?.totalCapacityQuantity ?? 0} icon={<HiOutlineCube className="text-lg" />} tone="info" />
                <SummaryCard label="Occupied (live)" value={summary?.totalOccupiedQuantity ?? 0} icon={<HiOutlineDatabase className="text-lg" />} tone="info" />
                <SummaryCard label="Utilization %" value={summary?.utilizationPct ?? 0} icon={<HiOutlineScale className="text-lg" />} tone="info" />
            </div>

            <AdaptiveCard className="mt-6">
                <WarehouseResponsiveTable<StorageBin>
                    columns={columns}
                    data={bins}
                    compact
                    loading={loading}
                    getRowId={(row) => row.id}
                    noData={!loading && bins.length === 0}
                    tableMinWidthClass="min-w-[1040px]"
                    mobile={capacityMobile}
                    instanceId="bin-capacity"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

type SummaryCardProps = { label: string; value: number; icon: React.ReactNode; tone?: 'default' | 'success' | 'info' }
const toneClasses: Record<string, { icon: string }> = {
    default: { icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    success: { icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
    info: { icon: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300' },
}
const SummaryCard = ({ label, value, icon, tone = 'default' }: SummaryCardProps) => (
    <AdaptiveCard>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString()}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone].icon}`}>{icon}</span>
        </div>
    </AdaptiveCard>
)

export default BinCapacityPage
