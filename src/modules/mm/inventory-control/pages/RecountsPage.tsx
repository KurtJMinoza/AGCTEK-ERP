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
import { inventoryControlService } from '../services/inventoryControlService'
import type { InventoryCountLine } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/recounts'

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const RecountsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryCountLine[]>([])
    const [loading, setLoading] = useState(true)
    const [active, setActive] = useState<InventoryCountLine | null>(null)
    const [qty, setQty] = useState(0)
    const [supervisor, setSupervisor] = useState('supervisor')
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryControlService.listLines({
                status: 'REQUIRE_RECOUNT',
                limit: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [])

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
                header: 'System',
                cell: ({ row }) => Number(row.original.systemQuantity ?? 0),
            },
            {
                header: 'Original count',
                cell: ({ row }) => Number(row.original.countedQuantity ?? 0),
            },
            {
                header: 'Variance',
                cell: ({ row }) => Number(row.original.varianceQuantity ?? 0),
            },
            {
                header: 'Value',
                cell: ({ row }) => Number(row.original.varianceValue ?? 0).toFixed(2),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'act',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="solid"
                        onClick={() => {
                            setActive(row.original)
                            setQty(Number(row.original.countedQuantity ?? 0))
                        }}
                    >
                        Recount
                    </Button>
                ),
            },
        ],
        [],
    )

    const submit = async () => {
        if (!active) return
        setSubmitting(true)
        try {
            await inventoryControlService.recount(active.id, {
                recountQuantity: qty,
                recountBy: supervisor,
            })
            pushToast('success', 'Recounted', 'Supervisor recount saved')
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
                title="Recounts"
                description="Lines over variance tolerance require supervisor recount."
                actions={<Button onClick={load}>Refresh</Button>}
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!active}
                onClose={() => setActive(null)}
                title="Supervisor recount"
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
                        >
                            Save recount
                        </Button>
                    </>
                }
            >
                {active && (
                    <div className="space-y-3">
                        <p className="text-sm">
                            System qty: <strong>{Number(active.systemQuantity ?? 0)}</strong> ·
                            Original: <strong>{Number(active.countedQuantity ?? 0)}</strong>
                        </p>
                        <FormItem label="Supervisor">
                            <Input
                                value={supervisor}
                                onChange={(e) => setSupervisor(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Recount quantity" asterisk>
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

export default RecountsPage
