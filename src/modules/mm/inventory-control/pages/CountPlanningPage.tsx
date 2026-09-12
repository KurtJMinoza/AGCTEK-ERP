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
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus } from 'react-icons/hi'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { orgService } from '../../material-master/services/referenceService'
import { warehouseService } from '../../warehouse/services/warehouseService'
import { inventoryControlService } from '../services/inventoryControlService'
import type { CountPlan, CountPolicy } from '../types'

const ROUTE = '/modules/mm/inventory-control/count-planning'
type Opt = { value: string; label: string }

const TYPE_OPTS: Opt[] = [
    { value: 'CYCLE_COUNT', label: 'Cycle count' },
    { value: 'PHYSICAL_INVENTORY', label: 'Physical inventory' },
    { value: 'BLIND_COUNT', label: 'Blind count' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const CountPlanningPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [policies, setPolicies] = useState<CountPolicy[]>([])
    const [plans, setPlans] = useState<CountPlan[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [policyOpen, setPolicyOpen] = useState(false)
    const [planOpen, setPlanOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [policyForm, setPolicyForm] = useState({
        name: '',
        companyId: '',
        warehouseId: '',
        abcClass: '',
        frequencyDays: 30,
        varianceQtyTolerance: 0,
        variancePctTolerance: 0,
        blindCountRequired: false,
    })
    const [planForm, setPlanForm] = useState({
        companyId: '',
        warehouseId: '',
        policyId: '',
        countType: 'CYCLE_COUNT',
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [p, pl] = await Promise.all([
                inventoryControlService.listPolicies({ pageSize: 100 }),
                inventoryControlService.listPlans({ pageSize: 50 }),
            ])
            setPolicies(p.data ?? [])
            setPlans(pl.data ?? [])
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
                const c = (Array.isArray(cos) ? cos : cos?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: x.name || x.code,
                }))
                setCompanies(c)
                setWarehouses(
                    (wh?.data ?? []).map((x: any) => ({
                        value: x.id,
                        label: `${x.code} — ${x.name}`,
                    })),
                )
                if (c[0]) {
                    setPolicyForm((f) => ({ ...f, companyId: f.companyId || c[0].value }))
                    setPlanForm((f) => ({ ...f, companyId: f.companyId || c[0].value }))
                }
            },
        )
    }, [load])

    const policyOpts = useMemo(
        () => [
            { value: '', label: 'None' },
            ...policies.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
        ],
        [policies],
    )

    const policyColumns = useMemo<ColumnDef<CountPolicy>[]>(
        () => [
            { header: 'Code', accessorKey: 'code', size: 120 },
            { header: 'Name', accessorKey: 'name', size: 180 },
            {
                header: 'ABC',
                accessorKey: 'abcClass',
                size: 70,
                cell: ({ row }) => row.original.abcClass || '—',
            },
            {
                header: 'Frequency (days)',
                accessorKey: 'frequencyDays',
                size: 120,
            },
            {
                header: 'Blind',
                accessorKey: 'blindCountRequired',
                size: 80,
                cell: ({ row }) => (row.original.blindCountRequired ? 'Yes' : 'No'),
            },
            {
                header: 'Active',
                accessorKey: 'isActive',
                size: 80,
                cell: ({ row }) => (
                    <StatusBadge tone={row.original.isActive ? 'success' : 'default'}>
                        {row.original.isActive ? 'Active' : 'Off'}
                    </StatusBadge>
                ),
            },
        ],
        [],
    )

    const planColumns = useMemo<ColumnDef<CountPlan>[]>(
        () => [
            {
                header: 'Plan #',
                accessorKey: 'planNumber',
                size: 160,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-primary">
                        {row.original.planNumber}
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
                size: 140,
                cell: ({ row }) => row.original.warehouse?.code ?? '—',
            },
            {
                header: 'Status',
                accessorKey: 'status',
                size: 120,
                cell: ({ row }) => (
                    <StatusBadge tone="warning">{row.original.status}</StatusBadge>
                ),
            },
            {
                header: '',
                id: 'actions',
                size: 120,
                cell: ({ row }) =>
                    ['PLANNED', 'OPEN'].includes(row.original.status) ? (
                        <Button
                            size="xs"
                            onClick={async () => {
                                try {
                                    await inventoryControlService.generatePlan(row.original.id)
                                    pushToast('success', 'Generated', 'Tasks generated')
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
                            Generate
                        </Button>
                    ) : null,
            },
        ],
        [load],
    )

    const createPolicy = async () => {
        setBusy(true)
        try {
            await inventoryControlService.createPolicy({
                ...policyForm,
                abcClass: policyForm.abcClass || undefined,
                warehouseId: policyForm.warehouseId || undefined,
            })
            pushToast('success', 'Created', 'Count policy created')
            setPolicyOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    const createPlan = async () => {
        setBusy(true)
        try {
            await inventoryControlService.createPlan({
                ...planForm,
                policyId: planForm.policyId || undefined,
            })
            pushToast('success', 'Created', 'Count plan created')
            setPlanOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message ?? e.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Count Planning"
                description="Configure ABC count policies and generate count plans by warehouse and cycle."
                actions={
                    <div className="flex gap-2">
                        <Button size="sm" icon={<HiOutlinePlus />} onClick={() => setPolicyOpen(true)}>
                            Policy
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlinePlus />}
                            onClick={() => setPlanOpen(true)}
                        >
                            Plan
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-6">
                <h6 className="mb-3 text-sm font-semibold">Count policies</h6>
                <DataTable columns={policyColumns} data={policies} loading={loading} compact />
            </AdaptiveCard>

            <AdaptiveCard>
                <h6 className="mb-3 text-sm font-semibold">Count plans</h6>
                <DataTable columns={planColumns} data={plans} loading={loading} compact />
            </AdaptiveCard>

            <FormDialog
                isOpen={policyOpen}
                onClose={() => setPolicyOpen(false)}
                title="Create count policy"
                size="lg"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setPolicyOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={busy} onClick={createPolicy}>
                            Create
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Name" asterisk className="col-span-2">
                        <Input
                            value={policyForm.name}
                            onChange={(e) => setPolicyForm((f) => ({ ...f, name: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((c) => c.value === policyForm.companyId)}
                            onChange={(o) =>
                                setPolicyForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="ABC class">
                        <Select
                            options={[
                                { value: '', label: 'All' },
                                { value: 'A', label: 'A' },
                                { value: 'B', label: 'B' },
                                { value: 'C', label: 'C' },
                            ]}
                            value={{
                                value: policyForm.abcClass,
                                label: policyForm.abcClass || 'All',
                            }}
                            onChange={(o) =>
                                setPolicyForm((f) => ({ ...f, abcClass: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Frequency days">
                        <Input
                            type="number"
                            value={policyForm.frequencyDays}
                            onChange={(e) =>
                                setPolicyForm((f) => ({
                                    ...f,
                                    frequencyDays: Number(e.target.value) || 1,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Qty tolerance">
                        <Input
                            type="number"
                            value={policyForm.varianceQtyTolerance}
                            onChange={(e) =>
                                setPolicyForm((f) => ({
                                    ...f,
                                    varianceQtyTolerance: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={planOpen}
                onClose={() => setPlanOpen(false)}
                title="Create count plan"
                size="lg"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setPlanOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={busy} onClick={createPlan}>
                            Create
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <FormItem label="Company" asterisk>
                        <Select
                            options={companies}
                            value={companies.find((c) => c.value === planForm.companyId)}
                            onChange={(o) =>
                                setPlanForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse" asterisk>
                        <Select
                            options={warehouses}
                            value={warehouses.find((w) => w.value === planForm.warehouseId)}
                            onChange={(o) =>
                                setPlanForm((f) => ({ ...f, warehouseId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Type" asterisk>
                        <Select
                            options={TYPE_OPTS}
                            value={TYPE_OPTS.find((t) => t.value === planForm.countType)}
                            onChange={(o) =>
                                setPlanForm((f) => ({
                                    ...f,
                                    countType: o?.value ?? 'CYCLE_COUNT',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Policy">
                        <Select
                            options={policyOpts}
                            value={policyOpts.find((p) => p.value === planForm.policyId)}
                            onChange={(o) =>
                                setPlanForm((f) => ({ ...f, policyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default CountPlanningPage
