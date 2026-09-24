'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { inventoryControlService } from '../services/inventoryControlService'
import type { CountSession } from '../types'

const ROUTE = '/modules/mm/inventory-control/count-sessions'

const STATUS_OPTS = [
    { value: '', label: 'All statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'VARIANCE', label: 'Variance' },
    { value: 'RECOUNT_REQUIRED', label: 'Recount required' },
    { value: 'PENDING_APPROVAL', label: 'Pending approval' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const CountSessionsPage = () => {
    const [rows, setRows] = useState<CountSession[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryControlService.listSessions({
                pageSize: 50,
                status: status || undefined,
            })
            setRows(res.data ?? [])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [status])

    useEffect(() => {
        load()
    }, [load])

    const columns = useMemo<ColumnDef<CountSession>[]>(
        () => [
            {
                header: 'Session #',
                accessorKey: 'sessionNumber',
                size: 160,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-primary">
                        {row.original.sessionNumber}
                    </span>
                ),
            },
            {
                header: 'Type',
                accessorKey: 'countType',
                size: 140,
                cell: ({ row }) => row.original.countType.replaceAll('_', ' '),
            },
            {
                header: 'Warehouse',
                id: 'wh',
                size: 120,
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Tasks',
                id: 'tasks',
                size: 80,
                cell: ({ row }) => row.original._count?.tasks ?? 0,
            },
            {
                header: 'Blind',
                accessorKey: 'blindMode',
                size: 70,
                cell: ({ row }) => (row.original.blindMode ? 'Yes' : 'No'),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 140,
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 100,
                cell: ({ row }) =>
                    row.original.status === 'OPEN' ? (
                        <button
                            type="button"
                            className="text-sm text-primary"
                            onClick={async () => {
                                try {
                                    await inventoryControlService.startSession(row.original.id)
                                    pushToast('success', 'Started', 'Session in progress')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Error',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Start
                        </button>
                    ) : null,
            },
        ],
        [load],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Count Sessions"
                description="Unified board for open and in-progress inventory count sessions."
            />
            <AdaptiveCard>
                <div className="mb-4 max-w-xs">
                    <Select
                        options={STATUS_OPTS}
                        value={STATUS_OPTS.find((o) => o.value === status) ?? STATUS_OPTS[0]}
                        onChange={(o) => setStatus(o?.value ?? '')}
                    />
                </div>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default CountSessionsPage
