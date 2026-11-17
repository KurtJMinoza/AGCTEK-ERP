'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProcurementResponsiveTable, {
    type ColumnDef,
} from '@/modules/mm/procurement/components/ProcurementResponsiveTable'
import {
    PrcAnimatedStatus,
    PrcDocNumberCell,
    PrcPlainCell,
    PRC_EXCEPTION_STATUS,
    prcStatusTone,
} from '@/modules/mm/procurement/components/procurementTableUi'
import { procurementParentBreadcrumbs } from '@/modules/mm/procurement/utils/procurementPageUi'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { threeWayMatchService } from '../services/threeWayMatchService'
import type { MatchException } from '../types'

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
    const parentBreadcrumbs = procurementParentBreadcrumbs(ROUTE)
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
                cell: ({ row }) => (
                    <PrcDocNumberCell
                        icon="invoice"
                        primary={
                            row.original.invoice?.invoiceNumber || row.original.invoiceId
                        }
                        secondary={
                            row.original.purchaseOrder?.poNumber ||
                            row.original.invoice?.purchaseOrder?.poNumber
                        }
                    />
                ),
            },
            {
                header: 'PO',
                cell: ({ row }) => (
                    <PrcPlainCell mono>
                        {row.original.purchaseOrder?.poNumber ||
                            row.original.invoice?.purchaseOrder?.poNumber ||
                            row.original.purchaseOrderId}
                    </PrcPlainCell>
                ),
            },
            {
                header: 'Type',
                accessorKey: 'varianceType',
                cell: ({ row }) => <PrcPlainCell>{row.original.varianceType}</PrcPlainCell>,
            },
            {
                header: 'Severity',
                accessorKey: 'severity',
                cell: ({ row }) => <PrcPlainCell mono>{row.original.severity}</PrcPlainCell>,
            },
            {
                header: 'Message',
                accessorKey: 'message',
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-xs text-sm text-gray-700 dark:text-gray-300">
                        {row.original.message}
                    </span>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <PrcAnimatedStatus
                        status={row.original.status}
                        tone={prcStatusTone(row.original.status, PRC_EXCEPTION_STATUS)}
                    />
                ),
            },
            {
                header: 'Payment',
                cell: ({ row }) => (
                    <PrcPlainCell>
                        {row.original.paymentBlocked ? 'Blocked' : 'Unblocked'}
                    </PrcPlainCell>
                ),
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
            <PageHeader
                breadcrumbs={parentBreadcrumbs}
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
                <ProcurementResponsiveTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    getRowId={(row) => row.id}
                    tableMinWidthClass="min-w-[1000px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default MatchExceptionsPage
