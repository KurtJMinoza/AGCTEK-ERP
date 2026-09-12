'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
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
import { storageBinService } from '../../warehouse/services/storageBinService'
import { materialService } from '../../material-master/services/materialService'
import { stockTransferOrderService } from '../services/stockTransferOrderService'
import StoOrderBoard from '../components/StoOrderBoard'
import { errMsg } from '../components/StoStatusTone'
import type { StoTransferType } from '../types'

const ROUTE = '/modules/mm/warehouse-management/transfer-orders'

type Opt = { value: string; label: string }
type LineInput = {
    materialId: string
    quantity: number
    sourceBinId: string
    destinationBinId: string
}

const TYPE_OPTS: Opt[] = [
    { value: 'WAREHOUSE_TO_WAREHOUSE', label: 'Warehouse to warehouse' },
    { value: 'BIN_TO_BIN', label: 'Bin to bin' },
    { value: 'BRANCH_TO_BRANCH', label: 'Branch to branch' },
    { value: 'PLANT_TO_PLANT', label: 'Plant to plant' },
]

const STATUS_OPTS: Opt[] = [
    { value: '', label: 'All statuses' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'PENDING_APPROVAL', label: 'Pending approval' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'ALLOCATED', label: 'Allocated' },
    { value: 'IN_TRANSIT', label: 'In transit' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'CANCELLED', label: 'Cancelled' },
]

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const TransferOrdersPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [warehouses, setWarehouses] = useState<Opt[]>([])
    const [bins, setBins] = useState<Opt[]>([])
    const [materials, setMaterials] = useState<
        Array<{ id: string; label: string; baseUomId?: string }>
    >([])
    const [boardKey, setBoardKey] = useState(0)

    const [form, setForm] = useState({
        companyId: '',
        transferType: 'WAREHOUSE_TO_WAREHOUSE' as StoTransferType,
        sourceWarehouseId: '',
        destinationWarehouseId: '',
        notes: '',
    })
    const [lines, setLines] = useState<LineInput[]>([
        { materialId: '', quantity: 1, sourceBinId: '', destinationBinId: '' },
    ])

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            warehouseService.list({ limit: 500 }),
            storageBinService.list({ limit: 500 }),
            materialService.list({ limit: 500 }),
        ]).then(([cos, wh, bn, mats]: any[]) => {
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
            setBins(
                (Array.isArray(bn) ? bn : bn?.data ?? []).map((x: any) => ({
                    value: x.id,
                    label: x.code,
                })),
            )
            setMaterials(
                (Array.isArray(mats) ? mats : mats?.data ?? []).map((m: any) => ({
                    id: m.id,
                    label: `${m.materialCode} — ${m.materialName}`,
                    baseUomId: m.baseUomId,
                })),
            )
            if (c[0]) setForm((f) => ({ ...f, companyId: f.companyId || c[0].value }))
        })
    }, [])

    const materialOpts = useMemo(
        () => materials.map((m) => ({ value: m.id, label: m.label })),
        [materials],
    )
    const binOpts = useMemo(
        () => [{ value: '', label: 'None' }, ...bins],
        [bins],
    )

    const openCreate = useCallback(() => {
        setForm((f) => ({
            companyId: f.companyId || companies[0]?.value || '',
            transferType: 'WAREHOUSE_TO_WAREHOUSE',
            sourceWarehouseId: '',
            destinationWarehouseId: '',
            notes: '',
        }))
        setLines([{ materialId: '', quantity: 1, sourceBinId: '', destinationBinId: '' }])
        setCreateOpen(true)
    }, [companies])

    const handleCreate = useCallback(async () => {
        if (!form.companyId || !form.sourceWarehouseId || !form.destinationWarehouseId) {
            pushToast('danger', 'Validation', 'Company and warehouses are required')
            return
        }
        if (
            form.transferType !== 'BIN_TO_BIN' &&
            form.sourceWarehouseId === form.destinationWarehouseId
        ) {
            pushToast('danger', 'Validation', 'Source and destination must differ')
            return
        }
        const payloadLines = lines
            .filter((l) => l.materialId && l.quantity > 0)
            .map((l) => {
                const mat = materials.find((m) => m.id === l.materialId)
                return {
                    materialId: l.materialId,
                    quantity: l.quantity,
                    uomId: mat?.baseUomId || '',
                    sourceBinId: l.sourceBinId || undefined,
                    destinationBinId: l.destinationBinId || undefined,
                }
            })
        if (!payloadLines.length || payloadLines.some((l) => !l.uomId)) {
            pushToast('danger', 'Validation', 'Add at least one material line with UOM')
            return
        }
        setCreating(true)
        try {
            const created = await stockTransferOrderService.create({
                ...form,
                lines: payloadLines,
            })
            pushToast('success', 'Created', `${created.orderNumber} created`)
            setCreateOpen(false)
            setBoardKey((k) => k + 1)
        } catch (err) {
            pushToast('danger', 'Error', errMsg(err))
        } finally {
            setCreating(false)
        }
    }, [form, lines, materials])

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Transfer Orders"
                description="Create, submit, approve, and manage stock transfer orders across warehouses and bins."
                actions={
                    <Button size="sm" variant="solid" icon={<HiOutlinePlus />} onClick={openCreate}>
                        New transfer order
                    </Button>
                }
            />

            <StoOrderBoard
                key={boardKey}
                statusFilterOptions={STATUS_OPTS}
                allowedActions={[
                    'submit',
                    'approve',
                    'allocate',
                    'dispatch',
                    'receive',
                    'cancel',
                ]}
            />

            <FormDialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create stock transfer order"
                size="xl"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={creating}
                            onClick={handleCreate}
                        >
                            Create
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormItem label="Company" asterisk>
                        <Select
                            options={companies}
                            value={companies.find((c) => c.value === form.companyId) ?? null}
                            onChange={(o) =>
                                setForm((f) => ({ ...f, companyId: o?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Transfer type" asterisk>
                        <Select
                            options={TYPE_OPTS}
                            value={TYPE_OPTS.find((t) => t.value === form.transferType)}
                            onChange={(o) =>
                                setForm((f) => ({
                                    ...f,
                                    transferType: (o?.value as StoTransferType) ?? f.transferType,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Source warehouse" asterisk>
                        <Select
                            options={warehouses}
                            value={
                                warehouses.find((w) => w.value === form.sourceWarehouseId) ?? null
                            }
                            onChange={(o) =>
                                setForm((f) => ({
                                    ...f,
                                    sourceWarehouseId: o?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Destination warehouse" asterisk>
                        <Select
                            options={warehouses}
                            value={
                                warehouses.find((w) => w.value === form.destinationWarehouseId) ??
                                null
                            }
                            onChange={(o) =>
                                setForm((f) => ({
                                    ...f,
                                    destinationWarehouseId: o?.value ?? '',
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Notes" className="sm:col-span-2">
                        <Input
                            value={form.notes}
                            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        />
                    </FormItem>
                </div>

                <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h6 className="text-sm font-semibold">Lines</h6>
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() =>
                                setLines((p) => [
                                    ...p,
                                    {
                                        materialId: '',
                                        quantity: 1,
                                        sourceBinId: '',
                                        destinationBinId: '',
                                    },
                                ])
                            }
                        >
                            + Add line
                        </Button>
                    </div>
                    {lines.map((line, idx) => (
                        <div
                            key={idx}
                            className="grid grid-cols-1 gap-2 rounded border border-gray-200 p-3 sm:grid-cols-5 dark:border-gray-700"
                        >
                            <FormItem label="Material" className="sm:col-span-2">
                                <Select
                                    options={materialOpts}
                                    value={
                                        materialOpts.find((m) => m.value === line.materialId) ??
                                        null
                                    }
                                    onChange={(o) =>
                                        setLines((prev) =>
                                            prev.map((l, i) =>
                                                i === idx
                                                    ? { ...l, materialId: o?.value ?? '' }
                                                    : l,
                                            ),
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Qty">
                                <Input
                                    type="number"
                                    min={0}
                                    value={line.quantity}
                                    onChange={(e) =>
                                        setLines((prev) =>
                                            prev.map((l, i) =>
                                                i === idx
                                                    ? {
                                                          ...l,
                                                          quantity: Number(e.target.value) || 0,
                                                      }
                                                    : l,
                                            ),
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Source bin">
                                <Select
                                    options={binOpts}
                                    value={
                                        binOpts.find((b) => b.value === line.sourceBinId) ??
                                        binOpts[0]
                                    }
                                    onChange={(o) =>
                                        setLines((prev) =>
                                            prev.map((l, i) =>
                                                i === idx
                                                    ? { ...l, sourceBinId: o?.value ?? '' }
                                                    : l,
                                            ),
                                        )
                                    }
                                />
                            </FormItem>
                            <FormItem label="Dest bin">
                                <Select
                                    options={binOpts}
                                    value={
                                        binOpts.find((b) => b.value === line.destinationBinId) ??
                                        binOpts[0]
                                    }
                                    onChange={(o) =>
                                        setLines((prev) =>
                                            prev.map((l, i) =>
                                                i === idx
                                                    ? {
                                                          ...l,
                                                          destinationBinId: o?.value ?? '',
                                                      }
                                                    : l,
                                            ),
                                        )
                                    }
                                />
                            </FormItem>
                        </div>
                    ))}
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default TransferOrdersPage
