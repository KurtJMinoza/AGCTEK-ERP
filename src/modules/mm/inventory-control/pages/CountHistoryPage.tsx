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

const ROUTE = '/modules/mm/inventory-control/count-history'

const STATUS_OPTS = [
    { value: '', label: 'Closed / adjusted / rejected' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'ADJUSTED', label: 'Adjusted' },
    { value: 'REJECTED', label: 'Rejected' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const CountHistoryPage = () => {
    const [rows, setRows] = useState<CountSession[]>([])
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            if (status) {
                const res = await inventoryControlService.listSessions({
                    pageSize: 100,
                    status,
                })
                setRows(res.data ?? [])
            } else {
                const results = await Promise.all(
                    ['CLOSED', 'ADJUSTED', 'REJECTED'].map((s) =>
                        inventoryControlService.listSessions({ pageSize: 50, status: s }),
                    ),
                )
                setRows(
                    results
                        .flatMap((r) => r.data ?? [])
                        .sort(
                            (a, b) =>
                                new Date(b.createdAt).getTime() -
                                new Date(a.createdAt).getTime(),
                        ),
                )
            }
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
                    <span className="font-mono text-xs font-semibold">
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
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => (
                    <StatusBadge
                        tone={
                            row.original.status === 'REJECTED' ? 'danger' : 'success'
                        }
                    >
                        {row.original.status}
                    </StatusBadge>
                ),
            },
            {
                header: 'Closed',
                accessorKey: 'closedAt',
                size: 120,
                cell: ({ row }) =>
                    row.original.closedAt
                        ? new Date(row.original.closedAt).toLocaleDateString()
                        : '—',
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="Count History"
                description="Closed, adjusted, and rejected count sessions for audit review."
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

export default CountHistoryPage
