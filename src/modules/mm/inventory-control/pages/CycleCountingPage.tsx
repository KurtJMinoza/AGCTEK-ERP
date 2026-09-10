'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import FormDialog from '@/components/shared/FormDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePlay } from 'react-icons/hi'
import { inventoryControlService } from '../services/inventoryControlService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { orgService } from '../../material-master/services/referenceService'
import type { CountRule, InventoryCount } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/inventory-control/cycle-counting'

type Opt = { value: string; label: string }

const ABC_OPTS = [
    { value: 'A', label: 'A — Weekly (7d)' },
    { value: 'B', label: 'B — Monthly (30d)' },
    { value: 'C', label: 'C — Quarterly (90d)' },
]

const FREQ_DEFAULT: Record<string, number> = { A: 7, B: 30, C: 90 }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const CycleCountingPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [tab, setTab] = useState('rules')
    const [rules, setRules] = useState<CountRule[]>([])
    const [counts, setCounts] = useState<InventoryCount[]>([])
    const [loading, setLoading] = useState(true)
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [companies, setCompanies] = useState<Opt[]>([])

    const [ruleOpen, setRuleOpen] = useState(false)
    const [genOpen, setGenOpen] = useState(false)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const [ruleForm, setRuleForm] = useState({
        code: '',
        name: '',
        companyId: '',
        warehouseId: '',
        abcClass: 'A',
        velocityClass: '',
        riskClass: '',
        frequencyDays: 7,
        varianceQtyTolerance: 0,
        varianceValueTolerance: 0,
        minUnitValue: '',
        maxUnitValue: '',
    })
    const [genForm, setGenForm] = useState({
        companyId: '',
        warehouseId: '',
        ruleId: '',
        assignedCounter: '',
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [r, c] = await Promise.all([
                inventoryControlService.listRules({ limit: 100 }),
                inventoryControlService.listCounts({ countType: 'CYCLE', limit: 50 }),
            ])
            setRules(r.data)
            setCounts(c.data)
        } catch (e: any) {
            pushToast('danger', 'Load failed', e?.response?.data?.message ?? e.message)
        } finally {
            setLoading(false)
        }
    }, [])

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

    const ruleColumns: ColumnDef<CountRule>[] = useMemo(
        () => [
            { header: 'Code', accessorKey: 'code' },
            { header: 'Name', accessorKey: 'name' },
            {
                header: 'ABC',
                cell: ({ row }) => row.original.abcClass ?? '—',
            },
            {
                header: 'Velocity',
                cell: ({ row }) => row.original.velocityClass ?? '—',
            },
            {
                header: 'Risk',
                cell: ({ row }) => row.original.riskClass ?? '—',
            },
            {
                header: 'Frequency',
                cell: ({ row }) => `${row.original.frequencyDays}d`,
            },
            {
                header: 'Qty tol',
                cell: ({ row }) => Number(row.original.varianceQtyTolerance),
            },
            {
                header: 'Active',
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>
                        {row.original.isActive ? 'Yes' : 'No'}
                    </StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                cell: ({ row }) => (
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineTrash />}
                        onClick={() => setDeleteId(row.original.id)}
                    />
                ),
            },
        ],
        [],
    )

    const countColumns: ColumnDef<InventoryCount>[] = useMemo(
        () => [
            { header: 'Count #', accessorKey: 'countNumber' },
            {
                header: 'Warehouse',
                cell: ({ row }) => row.original.warehouse?.name ?? '—',
            },
            {
                header: 'Rule',
                cell: ({ row }) => row.original.rule?.code ?? '—',
            },
            {
                header: 'Lines',
                cell: ({ row }) => row.original._count?.lines ?? row.original.lines?.length ?? 0,
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
                    row.original.status === 'OPEN' ? (
                        <Button
                            size="xs"
                            icon={<HiOutlinePlay />}
                            onClick={async () => {
                                try {
                                    await inventoryControlService.generate(row.original.id)
                                    await inventoryControlService.start(row.original.id)
                                    pushToast('success', 'Started', 'Cycle count is COUNTING')
                                    load()
                                } catch (e: any) {
                                    pushToast(
                                        'danger',
                                        'Failed',
                                        e?.response?.data?.message ?? e.message,
                                    )
                                }
                            }}
                        >
                            Generate & Start
                        </Button>
                    ) : null,
            },
        ],
        [load],
    )

    const submitRule = async () => {
        if (!ruleForm.name) {
            pushToast('danger', 'Validation', 'Name is required')
            return
        }
        setSubmitting(true)
        try {
            const { code: _code, minUnitValue, maxUnitValue, velocityClass, riskClass, ...rest } =
                ruleForm
            await inventoryControlService.createRule({
                ...rest,
                companyId: ruleForm.companyId || undefined,
                warehouseId: ruleForm.warehouseId || undefined,
                velocityClass: velocityClass || undefined,
                riskClass: riskClass || undefined,
                minUnitValue: minUnitValue !== '' ? Number(minUnitValue) : undefined,
                maxUnitValue: maxUnitValue !== '' ? Number(maxUnitValue) : undefined,
            })
            pushToast('success', 'Created', 'Count rule saved')
            setRuleOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
        } finally {
            setSubmitting(false)
        }
    }

    const submitGen = async () => {
        if (!genForm.companyId || !genForm.warehouseId || !genForm.ruleId) {
            pushToast('danger', 'Validation', 'Company, warehouse, and rule are required')
            return
        }
        setSubmitting(true)
        try {
            const session = await inventoryControlService.createCount({
                companyId: genForm.companyId,
                warehouseId: genForm.warehouseId,
                countType: 'CYCLE',
                ruleId: genForm.ruleId,
            })
            await inventoryControlService.generate(session.id, {
                assignedCounter: genForm.assignedCounter || undefined,
            })
            pushToast('success', 'Generated', `${session.countNumber} ready (OPEN)`)
            setGenOpen(false)
            setTab('sessions')
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
                title="Cycle Counting"
                description="ABC frequency rules and cycle count generation. A=weekly, B=monthly, C=quarterly."
                actions={
                    <div className="flex gap-2">
                        <Button icon={<HiOutlinePlus />} onClick={() => setRuleOpen(true)}>
                            New Rule
                        </Button>
                        <Button
                            variant="solid"
                            icon={<HiOutlinePlay />}
                            onClick={() => setGenOpen(true)}
                        >
                            Generate Cycle Count
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-4">
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.TabList>
                        <Tabs.TabNav value="rules">Count Rules</Tabs.TabNav>
                        <Tabs.TabNav value="sessions">Cycle Sessions</Tabs.TabNav>
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            <AdaptiveCard>
                {tab === 'rules' ? (
                    <DataTable columns={ruleColumns} data={rules} loading={loading} />
                ) : (
                    <DataTable columns={countColumns} data={counts} loading={loading} />
                )}
            </AdaptiveCard>

            <FormDialog
                isOpen={ruleOpen}
                onClose={() => setRuleOpen(false)}
                title="Create Count Rule"
                footer={
                    <>
                        <Button size="sm" onClick={() => setRuleOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submitRule}
                        >
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Code">
                        <Input
                            value="Auto-generated (e.g. CR-000001)"
                            disabled
                            className="!bg-gray-100 dark:!bg-gray-700/50"
                        />
                        <p className="mt-1 text-xs text-gray-400">Assigned automatically and cannot be changed.</p>
                    </FormItem>
                    <FormItem label="Name">
                        <Input
                            value={ruleForm.name}
                            placeholder="e.g. Weekly A-class cycle count"
                            onChange={(e) =>
                                setRuleForm((f) => ({ ...f, name: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="ABC Class">
                        <Select
                            options={ABC_OPTS}
                            value={ABC_OPTS.find((o) => o.value === ruleForm.abcClass)}
                            onChange={(o: any) =>
                                setRuleForm((f) => ({
                                    ...f,
                                    abcClass: o?.value ?? 'A',
                                    frequencyDays: FREQ_DEFAULT[o?.value ?? 'A'] ?? 30,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Velocity">
                        <Select
                            options={[
                                { value: '', label: 'Any' },
                                { value: 'FAST', label: 'Fast' },
                                { value: 'MEDIUM', label: 'Medium' },
                                { value: 'SLOW', label: 'Slow' },
                            ]}
                            value={
                                [
                                    { value: '', label: 'Any' },
                                    { value: 'FAST', label: 'Fast' },
                                    { value: 'MEDIUM', label: 'Medium' },
                                    { value: 'SLOW', label: 'Slow' },
                                ].find((o) => o.value === ruleForm.velocityClass) ?? null
                            }
                            onChange={(o: any) =>
                                setRuleForm((f) => ({ ...f, velocityClass: o?.value ?? '' }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="Risk">
                        <Select
                            options={[
                                { value: '', label: 'Any' },
                                { value: 'LOW', label: 'Low' },
                                { value: 'MEDIUM', label: 'Medium' },
                                { value: 'HIGH', label: 'High' },
                            ]}
                            value={
                                [
                                    { value: '', label: 'Any' },
                                    { value: 'LOW', label: 'Low' },
                                    { value: 'MEDIUM', label: 'Medium' },
                                    { value: 'HIGH', label: 'High' },
                                ].find((o) => o.value === ruleForm.riskClass) ?? null
                            }
                            onChange={(o: any) =>
                                setRuleForm((f) => ({ ...f, riskClass: o?.value ?? '' }))
                            }
                            isClearable
                        />
                    </FormItem>
                    <FormItem label="Min unit value">
                        <Input
                            type="number"
                            value={ruleForm.minUnitValue}
                            onChange={(e) =>
                                setRuleForm((f) => ({ ...f, minUnitValue: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Max unit value">
                        <Input
                            type="number"
                            value={ruleForm.maxUnitValue}
                            onChange={(e) =>
                                setRuleForm((f) => ({ ...f, maxUnitValue: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Frequency (days)">
                        <Input
                            type="number"
                            value={ruleForm.frequencyDays}
                            onChange={(e) =>
                                setRuleForm((f) => ({
                                    ...f,
                                    frequencyDays: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Qty tolerance">
                        <Input
                            type="number"
                            value={ruleForm.varianceQtyTolerance}
                            onChange={(e) =>
                                setRuleForm((f) => ({
                                    ...f,
                                    varianceQtyTolerance: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse (optional)">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === ruleForm.warehouseId)}
                            onChange={(o: any) =>
                                setRuleForm((f) => ({
                                    ...f,
                                    warehouseId: o?.value ?? '',
                                }))
                            }
                            isClearable
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={genOpen}
                onClose={() => setGenOpen(false)}
                title="Generate Cycle Count"
                footer={
                    <>
                        <Button size="sm" onClick={() => setGenOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submitGen}
                        >
                            Generate
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === genForm.companyId)}
                            onChange={(o: any) =>
                                setGenForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === genForm.warehouseId)}
                            onChange={(o: any) =>
                                setGenForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Rule">
                        <Select
                            options={rules.map((r) => ({
                                value: r.id,
                                label: `${r.code} (${r.abcClass ?? '—'})`,
                            }))}
                            value={
                                rules
                                    .map((r) => ({
                                        value: r.id,
                                        label: `${r.code} (${r.abcClass ?? '—'})`,
                                    }))
                                    .find((o) => o.value === genForm.ruleId) ?? null
                            }
                            onChange={(o: any) =>
                                setGenForm((f) => ({ ...f, ruleId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Assigned counter">
                        <Input
                            value={genForm.assignedCounter}
                            onChange={(e) =>
                                setGenForm((f) => ({
                                    ...f,
                                    assignedCounter: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <ConfirmDialog
                isOpen={!!deleteId}
                type="danger"
                title="Delete rule?"
                onCancel={() => setDeleteId(null)}
                onConfirm={async () => {
                    if (!deleteId) return
                    try {
                        await inventoryControlService.deleteRule(deleteId)
                        pushToast('success', 'Deleted', 'Rule removed')
                        setDeleteId(null)
                        load()
                    } catch (e: any) {
                        pushToast('danger', 'Failed', e?.response?.data?.message ?? e.message)
                    }
                }}
            >
                <p>This removes the count rule if it is not used by open sessions.</p>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default CycleCountingPage
