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
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlinePlay, HiOutlineCheck, HiOutlineX } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { InventoryCount } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/physical-inventory'

type Opt = { value: string; label: string }

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    OPEN: 'default',
    COUNTING: 'info',
    RECOUNT: 'warning',
    APPROVAL: 'warning',
    POSTED: 'success',
    CLOSED: 'success',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const PhysicalInventoryPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<InventoryCount[]>([])
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(true)
    const [detail, setDetail] = useState<InventoryCount | null>(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companies, setCompanies] = useState<Opt[]>([])
    const [form, setForm] = useState({
        companyId: '',
        warehouseId: '',
        assignedCounter: '',
        includeZeroBalances: true,
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await inventoryControlService.listCounts({
                countType: 'PHYSICAL',
                status: status || undefined,
                limit: 50,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [status])

    useEffect(() => {
        load()
        Promise.all([orgService.companies(), warehouseService.list({ limit: 200 })]).then(
            ([cos, wh]: any[]) => {
                setCompanies(
                    (Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({
                        value: c.id,
                        label: c.name || c.code,
                    })),
                )
                setWarehouses(
                    (wh?.data ?? []).map((w: any) => ({
                        value: w.id,
                        label: `${w.code} — ${w.name}`,
                    })),
                )
            },
        )
    }, [load])

    const run = async (fn: () => Promise<unknown>, ok: string) => {
        try {
            await fn()
            pushToast('success', 'OK', ok)
            if (detail) {
                const d = await inventoryControlService.getCount(detail.id)
                setDetail(d)
            }
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        }
    }

    const columns: ColumnDef<InventoryCount>[] = useMemo(
        () => [
            { header: 'Count #', accessorKey: 'countNumber' },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.name ?? '—',
            },
            {
                header: 'Lines',
                cell: ({ row }) => row.original._count?.lines ?? 0,
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                        {row.original.status}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'open',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        onClick={async () => {
                            const d = await inventoryControlService.getCount(row.original.id)
                            setDetail(d)
                        }}
                    >
                        Open
                    </Button>
                ),
            },
        ],
        [],
    )

    const createPi = async () => {
        if (!form.companyId || !form.warehouseId) {
            pushToast('danger', 'Validation', 'Company and warehouse required')
            return
        }
        setSubmitting(true)
        try {
            const session = await inventoryControlService.createCount({
                companyId: form.companyId,
                warehouseId: form.warehouseId,
                countType: 'PHYSICAL',
            })
            await inventoryControlService.generate(session.id, {
                assignedCounter: form.assignedCounter || undefined,
                includeZeroBalances: form.includeZeroBalances,
            })
            pushToast('success', 'Created', `${session.countNumber} generated`)
            setCreateOpen(false)
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
                title="Physical Inventory"
                description="Full stock-take sessions: OPEN → COUNTING → RECOUNT → APPROVAL → POSTED → CLOSED."
                actions={
                    <Button variant="solid" icon={<HiOutlinePlus />} onClick={() => setCreateOpen(true)}>
                        New Stock-Take
                    </Button>
                }
            />

            <AdaptiveCard className="mb-4">
                <Tabs value={status} onChange={setStatus}>
                    <Tabs.TabList>
                        {['', 'OPEN', 'COUNTING', 'RECOUNT', 'APPROVAL', 'POSTED', 'CLOSED'].map(
                            (s) => (
                                <Tabs.TabNav key={s || 'all'} value={s}>
                                    {s || 'All'}
                                </Tabs.TabNav>
                            ),
                        )}
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={!!detail}
                onClose={() => setDetail(null)}
                title={detail ? `PI ${detail.countNumber}` : 'Detail'}
                size="lg"
                footer={
                    detail ? (
                        <div className="flex flex-wrap gap-2">
                            {detail.status === 'OPEN' && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    icon={<HiOutlinePlay />}
                                    onClick={() =>
                                        run(() => inventoryControlService.start(detail.id), 'COUNTING')
                                    }
                                >
                                    Start
                                </Button>
                            )}
                            {(detail.status === 'COUNTING' || detail.status === 'RECOUNT') && (
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        run(
                                            () => inventoryControlService.computeVariances(detail.id),
                                            'Variances computed',
                                        )
                                    }
                                >
                                    Compute Variances
                                </Button>
                            )}
                            {detail.status === 'RECOUNT' && (
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        run(
                                            () => inventoryControlService.submitApproval(detail.id),
                                            'Submitted for approval',
                                        )
                                    }
                                >
                                    Submit Approval
                                </Button>
                            )}
                            {detail.status === 'APPROVAL' && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        icon={<HiOutlineCheck />}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    inventoryControlService.approve(detail.id, {
                                                        approvedBy: 'supervisor',
                                                    }),
                                                'Approved',
                                            )
                                        }
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        icon={<HiOutlineX />}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    inventoryControlService.reject(detail.id, {
                                                        reason: 'Rejected',
                                                    }),
                                                'Rejected / closed',
                                            )
                                        }
                                    >
                                        Reject
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={() =>
                                            run(
                                                () =>
                                                    inventoryControlService.postAdjustments(detail.id, {
                                                        approvedBy: 'supervisor',
                                                        adjustmentReason: 'COUNT_VARIANCE',
                                                    }),
                                                'Posted to ledger',
                                            )
                                        }
                                    >
                                        Post Adjustments
                                    </Button>
                                </>
                            )}
                            {detail.status === 'POSTED' && (
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        run(() => inventoryControlService.close(detail.id), 'Closed')
                                    }
                                >
                                    Close
                                </Button>
                            )}
                            <Button size="sm" onClick={() => setDetail(null)}>
                                Close dialog
                            </Button>
                        </div>
                    ) : null
                }
            >
                {detail && (
                    <div className="space-y-3">
                        <p className="text-sm">
                            Status:{' '}
                            <StatusBadge tone={STATUS_TONE[detail.status] ?? 'default'}>
                                {detail.status}
                            </StatusBadge>
                        </p>
                        <div className="max-h-80 overflow-auto text-sm">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="py-1 pr-2">#</th>
                                        <th className="py-1 pr-2">Material</th>
                                        <th className="py-1 pr-2">System</th>
                                        <th className="py-1 pr-2">Counted</th>
                                        <th className="py-1 pr-2">Variance</th>
                                        <th className="py-1">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(detail.lines ?? []).map((l) => (
                                        <tr key={l.id} className="border-b border-gray-100">
                                            <td className="py-1 pr-2">{l.lineNumber}</td>
                                            <td className="py-1 pr-2">
                                                {l.material?.materialCode ?? l.materialId.slice(0, 8)}
                                            </td>
                                            <td className="py-1 pr-2">{Number(l.systemQuantity ?? 0)}</td>
                                            <td className="py-1 pr-2">
                                                {l.recountQuantity != null
                                                    ? Number(l.recountQuantity)
                                                    : l.countedQuantity != null
                                                      ? Number(l.countedQuantity)
                                                      : '—'}
                                            </td>
                                            <td className="py-1 pr-2">{Number(l.varianceQuantity ?? 0)}</td>
                                            <td className="py-1">{l.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </FormDialog>

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="New Physical Inventory"
                footer={
                    <>
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={createPi}
                        >
                            Create & Generate
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === form.companyId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === form.warehouseId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Assigned counter">
                        <Input
                            value={form.assignedCounter}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, assignedCounter: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Include zero balances">
                        <Checkbox
                            checked={form.includeZeroBalances}
                            onChange={(checked) =>
                                setForm((f) => ({
                                    ...f,
                                    includeZeroBalances: Boolean(checked),
                                }))
                            }
                        >
                            Full stock-take (empty locations)
                        </Checkbox>
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default PhysicalInventoryPage
