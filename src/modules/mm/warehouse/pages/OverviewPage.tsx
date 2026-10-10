'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import {
    HiOutlineOfficeBuilding,
    HiOutlineArrowUp,
    HiOutlineCube,
} from 'react-icons/hi'
import { warehouseService } from '../services/warehouseService'
import { pickingService } from '../services/pickingService'
import { packingService } from '../services/packingService'
import { warehouseTaskService } from '../services/warehouseTaskService'
import type { PickingTask } from '../types'
import { assignedWorkerName } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/warehouse-management/overview'

const PICK_STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
    OPEN: 'warning',
    ASSIGNED: 'default',
    IN_PROGRESS: 'success',
    PARTIALLY_PICKED: 'warning',
    COMPLETED: 'success',
    EXCEPTION: 'danger',
    CANCELLED: 'danger',
}

const OverviewPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const router = useRouter()

    const [counts, setCounts] = useState({
        warehouses: 0,
        outbound: 0,
        packing: 0,
        pendingTasks: 0,
        exceptions: 0,
    })
    const [countsLoading, setCountsLoading] = useState(true)
    const [recentTasks, setRecentTasks] = useState<PickingTask[]>([])
    const [recentLoading, setRecentLoading] = useState(true)

    const fetchCounts = useCallback(async () => {
        setCountsLoading(true)
        try {
            const [wh, pick, pack, pending, exceptions] = await Promise.all([
                warehouseService.list({ status: 'ACTIVE', limit: 1 }),
                pickingService.list({ status: 'OPEN', limit: 1 }),
                packingService.list({ status: 'OPEN', limit: 1 }),
                warehouseTaskService.list({ status: 'PENDING', pageSize: 1 }),
                warehouseTaskService.list({ status: 'EXCEPTION', pageSize: 1 }),
            ])
            setCounts({
                warehouses: wh.meta.total,
                outbound: pick.meta.total,
                packing: pack.meta.total,
                pendingTasks: pending.total,
                exceptions: exceptions.total,
            })
        } catch {
            /* counts stay at 0 */
        } finally {
            setCountsLoading(false)
        }
    }, [])

    const fetchRecent = useCallback(async () => {
        setRecentLoading(true)
        try {
            const res = await pickingService.list({
                limit: 5,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            })
            setRecentTasks(res.data)
        } catch {
            /* leave empty */
        } finally {
            setRecentLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchCounts()
        fetchRecent()
    }, [fetchCounts, fetchRecent])

    const recentColumns = useMemo<ColumnDef<PickingTask>[]>(
        () => [
            {
                header: 'Task #',
                accessorKey: 'taskNumber',
                size: 140,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs font-semibold text-primary">
                        {row.original.taskNumber}
                    </span>
                ),
            },
            {
                header: 'Material',
                accessorKey: 'materialId',
                size: 220,
                cell: ({ row }) => {
                    const m = row.original.material
                    return (
                        <span className="truncate text-sm">
                            {m ? `${m.materialCode} â€” ${m.materialName}` : 'â€”'}
                        </span>
                    )
                },
            },
            {
                header: 'Qty',
                accessorKey: 'requiredQty',
                size: 80,
                cell: ({ row }) => (
                    <span className="text-sm font-medium">
                        {row.original.requiredQty.toLocaleString()}
                    </span>
                ),
            },
            {
                header: 'Worker',
                accessorKey: 'assignedUser',
                size: 140,
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {assignedWorkerName(
                            row.original.assignedUser,
                            undefined,
                            row.original.assignedWorker,
                        ) || 'Unassigned'}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => (
                    <StatusBadge tone={PICK_STATUS_TONE[row.original.status] ?? 'default'}>
                        {row.original.status}
                    </StatusBadge>
                ),
            },
        ],
        [],
    )

    const summaryCards = [
        {
            label: 'Warehouses',
            value: counts.warehouses,
            icon: <HiOutlineOfficeBuilding className="text-lg" />,
            tone: 'default' as const,
        },
        {
            label: 'Pending Tasks',
            value: counts.pendingTasks,
            icon: <HiOutlineArrowUp className="text-lg" />,
            tone: 'warning' as const,
        },
        {
            label: 'Outbound (Open)',
            value: counts.outbound,
            icon: <HiOutlineArrowUp className="text-lg" />,
            tone: 'success' as const,
        },
        {
            label: 'Exceptions',
            value: counts.exceptions,
            icon: <HiOutlineCube className="text-lg" />,
            tone: 'warning' as const,
        },
    ]

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Warehouse Overview"
                description="Operational dashboard for warehouse management."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryCards.map((card) => (
                    <SummaryCard
                        key={card.label}
                        label={card.label}
                        value={card.value}
                        icon={card.icon}
                        tone={card.tone}
                        loading={countsLoading}
                    />
                ))}
            </div>

            <AdaptiveCard className="mt-6">
                <h6 className="mb-3 text-sm font-semibold heading-text">Quick Actions</h6>
                <div className="flex flex-wrap gap-3">
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => router.push('/modules/mm/warehouse-management/picking')}
                    >
                        + Pick
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => router.push('/modules/mm/warehouse-management/packing')}
                    >
                        + Pack
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => router.push('/modules/mm/warehouse-management/task-queue')}
                    >
                        Task Queue
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() =>
                            router.push('/modules/mm/warehouse-management/transfer-orders')
                        }
                    >
                        + Transfer Order
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() =>
                            router.push('/modules/mm/warehouse-management/warehouse-transfers')
                        }
                    >
                        Legacy Transfers
                    </Button>
                </div>
            </AdaptiveCard>

            <AdaptiveCard className="mt-6">
                <h6 className="mb-3 text-sm font-semibold heading-text">Recent Picking Activity</h6>
                <DataTable<PickingTask>
                    columns={recentColumns}
                    data={recentTasks}
                    compact
                    loading={recentLoading}
                    noData={!recentLoading && recentTasks.length === 0}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

type SummaryCardProps = {
    label: string
    value: number
    icon: React.ReactNode
    tone: 'default' | 'success' | 'warning'
    loading?: boolean
}

const toneClasses: Record<string, { icon: string; text: string }> = {
    default: {
        icon: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    success: {
        icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
    warning: {
        icon: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300',
        text: 'text-gray-900 dark:text-gray-100',
    },
}

const SummaryCard = ({ label, value, icon, tone = 'default', loading }: SummaryCardProps) => (
    <AdaptiveCard>
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                {loading ? (
                    <div className="mt-2 h-7 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                ) : (
                    <p className={`mt-1 text-2xl font-bold ${toneClasses[tone].text}`}>
                        {value.toLocaleString()}
                    </p>
                )}
            </div>
            <span
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone].icon}`}
            >
                {icon}
            </span>
        </div>
    </AdaptiveCard>
)

export default OverviewPage
