'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import { HiOutlinePlus } from 'react-icons/hi'
import { valuationService } from '../services/valuationService'
import { orgService } from '../../material-master/services/referenceService'
import type { LandedCost } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { useMaterialOptions } from '@/modules/mm/shared/useEntityOptions'

const ROUTE = '/modules/mm/valuation/landed-cost'
type Opt = { value: string; label: string }

const COST_TYPES = [
    { value: 'FREIGHT', label: 'Freight' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'CUSTOMS', label: 'Customs' },
    { value: 'DUTY', label: 'Duty' },
    { value: 'HANDLING', label: 'Handling' },
    { value: 'OTHER', label: 'Other Charges' },
]

const ALLOC_BASES = [
    { value: 'QUANTITY', label: 'Quantity' },
    { value: 'WEIGHT', label: 'Weight' },
    { value: 'VOLUME', label: 'Volume' },
    { value: 'VALUE', label: 'Value' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'CUSTOM', label: 'Custom' },
]

const LandedCostPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<LandedCost[]>([])
    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const { options: materialOpts } = useMaterialOptions({ enabled: open })
    const [form, setForm] = useState({
        companyId: '',
        warehouseId: '',
        allocationBase: 'VALUE',
        costType: 'FREIGHT',
        amount: 0,
        remarks: '',
        materialId: '',
        valueBase: 0,
        quantity: 0,
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await valuationService.listLandedCosts({ limit: 50 })
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
    }, [])

    useEffect(() => {
        load()
        orgService.companies().then((cos: any) =>
            setCompanies(
                (Array.isArray(cos) ? cos : cos?.data ?? []).map((c: any) => ({
                    value: c.id,
                    label: c.name || c.code,
                })),
            ),
        )
        orgService.warehouses().then((list: any) =>
            setWarehouses(
                (Array.isArray(list) ? list : []).map((w: any) => ({
                    value: w.id,
                    label: w.name || w.code,
                })),
            ),
        )
    }, [load])

    const columns: ColumnDef<LandedCost>[] = useMemo(
        () => [
            { header: 'Document', accessorKey: 'documentNumber' },
            { header: 'Base', accessorKey: 'allocationBase' },
            { header: 'Total', accessorKey: 'totalAmount' },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Actions',
                cell: ({ row }) =>
                    row.original.status === 'DRAFT' ? (
                        <div className="flex gap-2">
                            <Button
                                size="xs"
                                onClick={async () => {
                                    try {
                                        await valuationService.allocatePreview(
                                            row.original.id,
                                        )
                                        await load()
                                        toast.push(
                                            <Notification type="success" title="Preview" closable>
                                                Preview saved (still DRAFT, not capitalized)
                                            </Notification>,
                                        )
                                    } catch (e: any) {
                                        toast.push(
                                            <Notification type="danger" title="Error" closable>
                                                {e?.response?.data?.message || 'Preview failed'}
                                            </Notification>,
                                        )
                                    }
                                }}
                            >
                                Preview
                            </Button>
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={async () => {
                                    try {
                                        await valuationService.allocateLandedCost(
                                            row.original.id,
                                            row.original.warehouseId
                                                ? { warehouseId: row.original.warehouseId }
                                                : undefined,
                                        )
                                        await load()
                                        toast.push(
                                            <Notification type="success" title="Capitalized" closable>
                                                Landed cost allocated and capitalized
                                            </Notification>,
                                        )
                                    } catch (e: any) {
                                        toast.push(
                                            <Notification type="danger" title="Error" closable>
                                                {e?.response?.data?.message ||
                                                    'Capitalize failed'}
                                            </Notification>,
                                        )
                                    }
                                }}
                            >
                                Allocate & capitalize
                            </Button>
                        </div>
                    ) : null,
            },
        ],
        [load],
    )

    const submit = async () => {
        setSubmitting(true)
        try {
            await valuationService.createLandedCost({
                companyId: form.companyId,
                warehouseId: form.warehouseId || undefined,
                allocationBase: form.allocationBase,
                remarks: form.remarks || undefined,
                lines: [
                    {
                        costType: form.costType,
                        amount: form.amount,
                        materialId: form.materialId || undefined,
                        valueBase: form.valueBase || undefined,
                        quantity: form.quantity || undefined,
                    },
                ],
            })
            setOpen(false)
            await load()
        } catch (e: any) {
            toast.push(
                <Notification type="danger" title="Error" closable>
                    {e?.response?.data?.message || 'Create failed'}
                </Notification>,
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Landed Cost"
                description="Freight, duty, customs, insurance, and handling — allocate and capitalize onto inventory valuation."
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        New Draft
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Create Landed Cost (Draft)"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={submit}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <FormItem label="Company" asterisk>
                        <Select
                            options={companies}
                            value={companies.find((o) => o.value === form.companyId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, companyId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse" asterisk>
                        <Select
                            options={warehouses}
                            value={warehouses.find((o) => o.value === form.warehouseId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, warehouseId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Allocation Base">
                        <Select
                            options={ALLOC_BASES}
                            value={ALLOC_BASES.find((o) => o.value === form.allocationBase)}
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    allocationBase: o?.value || 'VALUE',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Cost Type">
                        <Select
                            options={COST_TYPES}
                            value={COST_TYPES.find((o) => o.value === form.costType)}
                            onChange={(o: any) =>
                                setForm((f) => ({
                                    ...f,
                                    costType: o?.value || 'FREIGHT',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Amount">
                        <Input
                            type="number"
                            value={form.amount}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    amount: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Material">
                        <Select
                            options={materialOpts}
                            value={materialOpts.find((o) => o.value === form.materialId)}
                            onChange={(o: any) =>
                                setForm((f) => ({ ...f, materialId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Value base (for VALUE allocation)">
                        <Input
                            type="number"
                            value={form.valueBase}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    valueBase: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Quantity (for QUANTITY allocation)">
                        <Input
                            type="number"
                            value={form.quantity}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    quantity: Number(e.target.value) || 0,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Remarks">
                        <Input
                            value={form.remarks}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, remarks: e.target.value }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default LandedCostPage
