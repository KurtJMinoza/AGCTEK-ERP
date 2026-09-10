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
import {
    purchaseContractService,
    type PurchaseContract,
} from '../services/purchaseContractService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'

const ROUTE = '/modules/mm/procurement/purchase-contracts'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const PurchaseContractsPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<PurchaseContract[]>([])
    const [loading, setLoading] = useState(true)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [suppliers, setSuppliers] = useState<Opt[]>([])
    const [companyId, setCompanyId] = useState('')
    const [status, setStatus] = useState('')
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({
        supplierId: '',
        buyerId: 'buyer-1',
        validFrom: new Date().toISOString().slice(0, 10),
        validTo: '',
        deliveryTerms: '',
        notes: '',
    })

    useEffect(() => {
        Promise.all([
            orgService.companies(),
            supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' }),
        ]).then(([cos, sup]) => {
            const c = (Array.isArray(cos) ? cos : []).map((x: any) => ({
                value: x.id,
                label: x.name || x.code,
            }))
            setCompanies(c)
            setSuppliers(
                (sup?.data ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.supplierCode} — ${s.supplierName}`,
                })),
            )
            if (c[0]) setCompanyId(c[0].value)
        })
    }, [])

    const load = useCallback(async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const res = await purchaseContractService.list({
                companyId,
                status: status || undefined,
                pageSize: 100,
            })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
        } finally {
            setLoading(false)
        }
    }, [companyId, status])

    useEffect(() => {
        load()
    }, [load])

    const columns: ColumnDef<PurchaseContract>[] = useMemo(
        () => [
            {
                header: 'Contract',
                cell: ({ row }) => (
                    <span className="font-mono text-sm">
                        {row.original.contractNumber}
                    </span>
                ),
            },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier
                        ? row.original.supplier.supplierCode
                        : '—',
            },
            {
                header: 'Buyer',
                cell: ({ row }) => row.original.buyerId,
            },
            {
                header: 'Valid from',
                cell: ({ row }) =>
                    String(row.original.validFrom).slice(0, 10),
            },
            {
                header: 'Valid to',
                cell: ({ row }) =>
                    row.original.validTo
                        ? String(row.original.validTo).slice(0, 10)
                        : '—',
            },
            {
                header: 'PO link',
                cell: ({ row }) =>
                    row.original.purchaseOrder?.poNumber ?? '—',
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge status={row.original.status} />
                ),
            },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <div className="flex gap-1">
                        {row.original.status === 'DRAFT' && (
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={async () => {
                                    try {
                                        await purchaseContractService.activate(
                                            row.original.id,
                                        )
                                        pushToast('success', 'Activated', 'Contract is ACTIVE')
                                        load()
                                    } catch (e: any) {
                                        pushToast(
                                            'danger',
                                            'Error',
                                            e?.response?.data?.message ||
                                                'Activate failed',
                                        )
                                    }
                                }}
                            >
                                Activate
                            </Button>
                        )}
                        {row.original.status === 'ACTIVE' && (
                            <Button
                                size="xs"
                                onClick={async () => {
                                    try {
                                        await purchaseContractService.expire(
                                            row.original.id,
                                        )
                                        load()
                                    } catch (e: any) {
                                        pushToast(
                                            'danger',
                                            'Error',
                                            e?.response?.data?.message ||
                                                'Expire failed',
                                        )
                                    }
                                }}
                            >
                                Expire
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [load],
    )

    const create = async () => {
        if (!companyId || !form.supplierId) {
            pushToast('danger', 'Error', 'Company and supplier required')
            return
        }
        setSubmitting(true)
        try {
            await purchaseContractService.create({
                companyId,
                supplierId: form.supplierId,
                buyerId: form.buyerId,
                validFrom: form.validFrom,
                validTo: form.validTo || undefined,
                deliveryTerms: form.deliveryTerms || undefined,
                notes: form.notes || undefined,
                createdBy: form.buyerId,
            })
            pushToast('success', 'Created', 'DRAFT contract created (terms only)')
            setOpen(false)
            load()
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Create failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title="Purchase Contracts"
                description="Commercial terms with suppliers — does not create inventory"
                actions={
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        New Contract
                    </Button>
                }
            />
            <AdaptiveCard className="mb-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <FormItem label="Company">
                        <Select
                            options={companies}
                            value={companies.find((c) => c.value === companyId) ?? null}
                            onChange={(o: any) => setCompanyId(o?.value ?? '')}
                        />
                    </FormItem>
                    <FormItem label="Status">
                        <Select
                            options={[
                                { value: '', label: 'All' },
                                { value: 'DRAFT', label: 'Draft' },
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'EXPIRED', label: 'Expired' },
                                { value: 'CANCELLED', label: 'Cancelled' },
                            ]}
                            value={
                                status
                                    ? { value: status, label: status }
                                    : { value: '', label: 'All' }
                            }
                            onChange={(o: any) => setStatus(o?.value ?? '')}
                        />
                    </FormItem>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="New Purchase Contract"
                description="Commercial terms only — never posts stock"
                footer={
                    <>
                        <Button size="sm" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={submitting}
                            onClick={create}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <FormItem label="Supplier" asterisk>
                    <Select
                        options={suppliers}
                        value={
                            suppliers.find((s) => s.value === form.supplierId) ??
                            null
                        }
                        onChange={(o: any) =>
                            setForm((p) => ({
                                ...p,
                                supplierId: o?.value ?? '',
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Buyer">
                    <Input
                        value={form.buyerId}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, buyerId: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Valid from">
                    <Input
                        type="date"
                        value={form.validFrom}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                validFrom: e.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Valid to">
                    <Input
                        type="date"
                        value={form.validTo}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, validTo: e.target.value }))
                        }
                    />
                </FormItem>
                <FormItem label="Delivery terms">
                    <Input
                        value={form.deliveryTerms}
                        onChange={(e) =>
                            setForm((p) => ({
                                ...p,
                                deliveryTerms: e.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Notes">
                    <Input
                        textArea
                        value={form.notes}
                        onChange={(e) =>
                            setForm((p) => ({ ...p, notes: e.target.value }))
                        }
                    />
                </FormItem>
            </FormDialog>
        </PageContainer>
    )
}

export default PurchaseContractsPage
