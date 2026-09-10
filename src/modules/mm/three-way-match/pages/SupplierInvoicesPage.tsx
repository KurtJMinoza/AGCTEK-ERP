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
import { threeWayMatchService } from '../services/threeWayMatchService'
import { orgService } from '../../material-master/services/referenceService'
import type { SupplierInvoice } from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import ErpAxiosBase from '@/services/axios/ErpAxiosBase'

const ROUTE = '/modules/mm/procurement/supplier-invoices'
type Opt = { value: string; label: string }

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

const SupplierInvoicesPage = () => {
    const breadcrumbItems = buildErpBreadcrumbs(ROUTE)
    const [rows, setRows] = useState<SupplierInvoice[]>([])
    const [loading, setLoading] = useState(false)
    const [companies, setCompanies] = useState<Opt[]>([])
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({
        companyId: '',
        purchaseOrderId: '',
        supplierId: '',
        currencyId: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        materialId: '',
        purchaseOrderLineId: '',
        uomId: '',
        invoicedQuantity: 0,
        unitPrice: 0,
        taxAmount: 0,
        goodsReceiptLineId: '',
        allocatedQuantity: 0,
    })

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await threeWayMatchService.listInvoices({ limit: 50 })
            setRows(res.data)
        } catch (e: any) {
            pushToast('danger', 'Error', e?.response?.data?.message || 'Load failed')
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
    }, [load])

    const loadPoDefaults = async (poId: string) => {
        if (!poId) return
        try {
            const po = await ErpAxiosBase.get(`/mm/purchase-orders/${poId}`).then(
                (r) => r.data,
            )
            const line = po.lines?.[0]
            const grs = await ErpAxiosBase.get('/mm/goods-receipts', {
                params: { purchaseOrderId: poId, status: 'POSTED', limit: 20 },
            }).then((r) => r.data)
            const grList = grs?.data ?? grs ?? []
            const grLine =
                grList
                    .flatMap((g: any) =>
                        (g.lines ?? []).map((l: any) => ({
                            ...l,
                            receiptId: g.id,
                        })),
                    )
                    .find(
                        (l: any) =>
                            !line || l.purchaseOrderLineId === line.id || !l.purchaseOrderLineId,
                    ) ||
                grList[0]?.lines?.[0]

            setForm((f) => ({
                ...f,
                purchaseOrderId: poId,
                companyId: po.companyId || f.companyId,
                supplierId: po.supplierId,
                currencyId: po.currencyId || '',
                materialId: line?.materialId || '',
                purchaseOrderLineId: line?.id || '',
                uomId: line?.uomId || '',
                unitPrice: Number(line?.unitPrice || 0),
                taxAmount: Number(line?.tax || 0),
                invoicedQuantity: Number(line?.receivedQuantity || line?.quantity || 0),
                goodsReceiptLineId: grLine?.id || '',
                allocatedQuantity: Number(
                    grLine?.quantity || line?.receivedQuantity || 0,
                ),
            }))
        } catch (e: any) {
            pushToast('danger', 'PO', e?.response?.data?.message || 'Failed to load PO')
        }
    }

    const columns: ColumnDef<SupplierInvoice>[] = useMemo(
        () => [
            { header: 'Invoice', accessorKey: 'invoiceNumber' },
            {
                header: 'Supplier',
                cell: ({ row }) =>
                    row.original.supplier?.supplierName || row.original.supplierId,
            },
            {
                header: 'PO',
                cell: ({ row }) =>
                    row.original.purchaseOrder?.poNumber || row.original.purchaseOrderId,
            },
            { header: 'Total', accessorKey: 'totalAmount' },
            {
                header: 'Status',
                cell: ({ row }) => <StatusBadge status={row.original.status} />,
            },
            {
                header: 'Payment',
                cell: ({ row }) =>
                    row.original.paymentEligible ? 'Eligible' : 'Blocked',
            },
            {
                header: 'Actions',
                cell: ({ row }) => (
                    <div className="flex gap-1">
                        {row.original.status === 'DRAFT' && (
                            <Button
                                size="xs"
                                onClick={async () => {
                                    try {
                                        await threeWayMatchService.submitInvoice(
                                            row.original.id,
                                        )
                                        pushToast('success', 'Submitted', 'Ready to match')
                                        load()
                                    } catch (e: any) {
                                        pushToast(
                                            'danger',
                                            'Fail',
                                            e?.response?.data?.message || e.message,
                                        )
                                    }
                                }}
                            >
                                Submit
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [load],
    )

    const submit = async () => {
        setSubmitting(true)
        try {
            await threeWayMatchService.createInvoice({
                companyId: form.companyId,
                supplierId: form.supplierId,
                purchaseOrderId: form.purchaseOrderId,
                currencyId: form.currencyId || undefined,
                invoiceDate: form.invoiceDate,
                taxAmount: form.taxAmount,
                lines: [
                    {
                        materialId: form.materialId,
                        purchaseOrderLineId: form.purchaseOrderLineId,
                        uomId: form.uomId,
                        invoicedQuantity: form.invoicedQuantity,
                        unitPrice: form.unitPrice,
                        taxAmount: form.taxAmount,
                        receipts: [
                            {
                                goodsReceiptLineId: form.goodsReceiptLineId,
                                allocatedQuantity: form.allocatedQuantity,
                            },
                        ],
                    },
                ],
            })
            setOpen(false)
            pushToast('success', 'Created', 'Supplier invoice draft created')
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
                title="Supplier Invoices"
                description="Capture supplier invoices linked to PO and goods receipts for three-way match"
                actions={
                    <Button
                        variant="solid"
                        icon={<HiOutlinePlus />}
                        onClick={() => setOpen(true)}
                    >
                        New Invoice
                    </Button>
                }
            />
            <AdaptiveCard>
                <DataTable columns={columns} data={rows} loading={loading} />
            </AdaptiveCard>

            <FormDialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Create Supplier Invoice"
                size="lg"
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
                            Create Draft
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
                                setForm((f) => ({ ...f, companyId: o?.value || '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Purchase Order ID">
                        <div className="flex gap-2">
                            <Input
                                value={form.purchaseOrderId}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        purchaseOrderId: e.target.value,
                                    }))
                                }
                            />
                            <Button
                                size="sm"
                                onClick={() => loadPoDefaults(form.purchaseOrderId)}
                            >
                                Load
                            </Button>
                        </div>
                    </FormItem>
                    <FormItem label="Invoice Date">
                        <Input
                            type="date"
                            value={form.invoiceDate}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, invoiceDate: e.target.value }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Invoiced Qty">
                        <Input
                            type="number"
                            value={form.invoicedQuantity}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    invoicedQuantity: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Unit Price">
                        <Input
                            type="number"
                            value={form.unitPrice}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    unitPrice: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Tax Amount">
                        <Input
                            type="number"
                            value={form.taxAmount}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    taxAmount: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="GR Line ID (allocation)">
                        <Input
                            value={form.goodsReceiptLineId}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    goodsReceiptLineId: e.target.value,
                                }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Allocated GR Qty">
                        <Input
                            type="number"
                            value={form.allocatedQuantity}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    allocatedQuantity: Number(e.target.value),
                                }))
                            }
                        />
                    </FormItem>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

export default SupplierInvoicesPage
