'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlineQrcode } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import type { InventoryCountLine } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/blind-counting'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const BlindCountingPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryCountLine[]>([])
    const [loading, setLoading] = useState(true)
    const [counter, setCounter] = useState('')
    const [active, setActive] = useState<InventoryCountLine | null>(null)
    const [qty, setQty] = useState(0)
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryControlService.listLines({
                status: 'PENDING',
                blind: true,
                assignedCounter: counter || undefined,
                limit: 100,
            })
            // Also include COUNTED for visibility without system qty
            const counted = await inventoryControlService.listLines({
                status: 'COUNTED',
                blind: true,
                assignedCounter: counter || undefined,
                limit: 50,
            })
            setRows([
                ...res.data.filter((l) =>
                    ['COUNTING', 'RECOUNT'].includes(l.count?.status ?? ''),
                ),
                ...counted.data.filter((l) =>
                    ['COUNTING', 'RECOUNT'].includes(l.count?.status ?? ''),
                ),
            ])
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [counter])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<InventoryCountLine>[] = useMemo(
        () => [
            {
                header: 'Count',
                cell: ({ row }) => row.original.count?.countNumber ?? '—',
            },
            {
                header: 'Material',
                cell: ({ row }) =>
                    row.original.material?.materialCode ??
                    row.original.materialId.slice(0, 8),
            },
            {
                header: 'Bin',
                cell: ({ row }) => row.original.storageBin?.code ?? '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="info">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) =>
                    row.original.status === 'PENDING' ? (
                        <Button
                            size="xs"
                            variant="solid"
                            icon={<HiOutlineQrcode />}
                            onClick={() => {
                                setActive(row.original)
                                setQty(0)
                            }}
                        >
                            Count
                        </Button>
                    ) : (
                        <span className="text-xs text-gray-500">
                            Entered {Number(row.original.countedQuantity ?? 0)}
                        </span>
                    ),
            },
        ],
        [],
    )

    const submit = async () => {
        if (!active) return
        setSubmitting(true)
        try {
            await inventoryControlService.blindCount(active.id, {
                countedQuantity: qty,
                countedBy: counter || 'counter',
                idempotencyKey: `blind-${active.id}-${Date.now()}`,
            })
            pushToast('success', 'Recorded', 'Physical quantity saved (blind)')
            setActive(null)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Blind Counting"
                description="Counters enter physical quantity only — system quantity is never shown."
            />

            <AdaptiveCard className="mb-4">
                <FormItem label="Filter by assigned counter">
                    <div className="flex gap-2">
                        <Input
                            className="max-w-xs"
                            value={counter}
                            onChange={(e) => setCounter(e.target.value)}
                            placeholder="Counter id / name"
                        />
                        <Button onClick={load}>Refresh</Button>
                    </div>
                </FormItem>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!active}
                onClose={() => setActive(null)}
                title="Enter physical quantity"
                footer={
                    <>
                        <Button size="sm" onClick={() => setActive(null)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submit}
                            disabled={qty < 0}
                        >
                            Confirm
                        </Button>
                    </>
                }
            >
                {active && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-500">
                            {active.material?.materialCode} / bin{' '}
                            {active.storageBin?.code ?? '—'}
                        </p>
                        <p className="text-xs text-amber-600">
                            Expected (system) quantity is hidden for blind count.
                        </p>
                        <FormItem label="Physical quantity" asterisk>
                            <Input
                                type="number"
                                min={0}
                                value={qty}
                                onChange={(e) => setQty(Number(e.target.value))}
                            />
                        </FormItem>
                    </div>
                )}
            </FormDialog>
        </PageContainer>
    )
}

export default BlindCountingPage
