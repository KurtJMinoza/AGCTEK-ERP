'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { threeWayMatchService } from '../services/threeWayMatchService'
import type { MatchException } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/procurement/match-exceptions'
type Opt = { value: string; label: string }

const STATUS_OPTS: Opt[] = [
    { value: '', label: 'All' },
    { value: 'OPEN', label: 'OPEN' },
    { value: 'ACKNOWLEDGED', label: 'ACKNOWLEDGED' },
    { value: 'RESOLVED', label: 'RESOLVED' },
    { value: 'WAIVED', label: 'WAIVED' },
]

const MatchExceptionsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<MatchException[]>([])
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState('OPEN')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await threeWayMatchService.listExceptions({
                status: status || undefined,
                limit: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Load failed'}
                </Notification>,
            )
        } finally {
            setLoading(false)
        }
    }, [status])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<MatchException>[] = useMemo(
        () => [
            {
                header: 'Invoice',
                cell: ({ row }) =>
                    row.original.invoice?.invoiceNumber || row.original.invoiceId,
            },
            {
                header: 'PO',
                cell: ({ row }) =>
                    row.original.purchaseOrder?.poNumber ||
                    row.original.invoice?.purchaseOrder?.poNumber ||
                    row.original.purchaseOrderId,
            },
            { header: 'Type', accessorKey: 'varianceType' },
            { header: 'Severity', accessorKey: 'severity' },
            { header: 'Message', accessorKey: 'message' },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Payment',
                cell: ({ row }) =>
                    row.original.paymentBlocked ? 'Blocked' : 'Unblocked',
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    ['OPEN', 'ACKNOWLEDGED'].includes(row.original.status) ? (
                        <div className="flex gap-1">
                            {row.original.status === 'OPEN' && (
                                <Button
                                    size="xs"
                                    onClick={async () => {
                                        await threeWayMatchService.acknowledgeException(
                                            row.original.id,
                                        )
                                        load()
                                    }}
                                >
                                    Ack
                                </Button>
                            )}
                            <Button
                                size="xs"
                                onClick={async () => {
                                    await threeWayMatchService.resolveException(
                                        row.original.id,
                                    )
                                    load()
                                }}
                            >
                                Resolve
                            </Button>
                            <Button
                                size="xs"
                                onClick={async () => {
                                    await threeWayMatchService.waiveException(
                                        row.original.id,
                                    )
                                    load()
                                }}
                            >
                                Waive
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [load],
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Match Exceptions"
                description="Quantity, price, tax, and currency variances that block payment eligibility"
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <FormItem label="Status">
                        <Select
                            options={STATUS_OPTS}
                            value={STATUS_OPTS.find((o) => o.value === status)}
                            onChange={(o: any) => setStatus(o?.value || '')}
                        />
                    </FormItem>
                    <Button variant="solid" onClick={load}>
                        Refresh
                    </Button>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default MatchExceptionsPage
