'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineClipboardList,
    HiOutlineUsers,
    HiOutlineDocumentText,
    HiOutlineChartBar,
    HiOutlineBadgeCheck,
    HiOutlineClock,
    HiOutlineBan,
    HiOutlineLockClosed,
    HiOutlinePaperAirplane,
    HiOutlineScale,
    HiOutlinePlus,
    HiOutlineTrash,
    HiOutlineDocumentDuplicate,
} from 'react-icons/hi'
import { rfqService } from '../services/rfqService'
import { quotationService } from '../services/quotationService'
import { purchaseOrderService } from '../services/purchaseOrderService'
import { supplierService } from '@/modules/mm/supplier-management/services/supplierService'
import { paymentTermsService } from '@/modules/mm/supplier-management/services/paymentTermsService'
import { orgService } from '@/modules/mm/material-master/services/referenceService'
import type {
    MmRfq,
    MmRfqLine,
    MmRfqSupplier,
    MmSupplierQuotation,
    MmRfqAward,
    MmRfqAudit,
    RfqComparisonResponse,
    RfqComparisonRow,
} from '../types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    firstError,
    nonNegativeNumber,
    positiveNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

const ROUTE_PATH = '/modules/mm/procurement/rfqs'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    ISSUED: 'info',
    PARTIALLY_RESPONDED: 'warning',
    RESPONDED: 'info',
    EVALUATION: 'warning',
    AWARDED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
    SUBMITTED: 'info',
    WITHDRAWN: 'default',
    EXPIRED: 'danger',
    SELECTED: 'success',
    INVITED: 'info',
    DECLINED: 'danger',
}

type FilterOption = { value: string; label: string }

type QuoteLineDraft = {
    key: string
    rfqLineId: string
    materialId: string
    quantity: string
    uomId: string
    unitPrice: string
    discount: string
    tax: string
    leadTimeDays: string
    moq: string
    warranty: string
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

const RfqDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    const [rfq, setRfq] = useState<MmRfq | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('lines')
    const [audits, setAudits] = useState<MmRfqAudit[]>([])
    const [comparison, setComparison] = useState<RfqComparisonResponse | null>(null)
    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => Promise<void> } | null>(null)
    const [confirming, setConfirming] = useState(false)

    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteIds, setInviteIds] = useState<string[]>([])
    const [suppliers, setSuppliers] = useState<FilterOption[]>([])
    const [currencies, setCurrencies] = useState<FilterOption[]>([])
    const [paymentTerms, setPaymentTerms] = useState<FilterOption[]>([])

    const [awardOpen, setAwardOpen] = useState(false)
    const [awardForm, setAwardForm] = useState({
        quotationId: '',
        reason: '',
        evaluatedBy: 'current-user',
        useCheapest: false,
    })
    const [awardTouched, setAwardTouched] = useState<Record<string, boolean>>({})
    const [awardForce, setAwardForce] = useState(false)
    const [awarding, setAwarding] = useState(false)
    const [creatingPo, setCreatingPo] = useState(false)

    const [quoteOpen, setQuoteOpen] = useState(false)
    const [quoteForm, setQuoteForm] = useState({
        supplierId: '',
        validityDate: '',
        currencyId: '',
        paymentTermsId: '',
        deliveryTerms: '',
        freight: '0',
        tax: '0',
        notes: '',
    })
    const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>([])
    const [quoteTouched, setQuoteTouched] = useState<Record<string, boolean>>({})
    const [quoteForce, setQuoteForce] = useState(false)
    const [quoteSubmitting, setQuoteSubmitting] = useState(false)

    const fetchRfq = useCallback(async () => {
        setLoading(true)
        try {
            const data = await rfqService.get(id)
            setRfq(data)
        } catch {
            pushToast('danger', 'Error', 'Failed to load RFQ')
            setRfq(null)
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchRfq() }, [fetchRfq])

    useEffect(() => {
        supplierService.list({ page: 1, pageSize: 200, status: 'ACTIVE' }).then((res) => {
            setSuppliers(res.data.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.supplierName}` })))
        }).catch(() => {})
        orgService.currencies().then((list) => {
            setCurrencies(list.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })))
        }).catch(() => {})
        paymentTermsService.list().then((list) => {
            setPaymentTerms(list.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })))
        }).catch(() => {})
    }, [])

    useEffect(() => {
        if (tab === 'audit') {
            rfqService.getAudit(id).then(setAudits).catch(() => setAudits([]))
        }
        if (tab === 'comparison' || tab === 'award') {
            rfqService.getComparison(id).then(setComparison).catch(() => setComparison(null))
        }
    }, [tab, id])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchRfq()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchRfq])

    const awardErrors = useMemo<FieldErrors>(() => ({
        quotationId: awardForm.useCheapest ? undefined : required(awardForm.quotationId, 'Quotation'),
        reason: required(awardForm.reason, 'Reason'),
    }), [awardForm])

    const quoteHeaderErrors = useMemo<FieldErrors>(() => ({
        supplierId: required(quoteForm.supplierId, 'Supplier'),
        validityDate: required(quoteForm.validityDate, 'Validity date'),
    }), [quoteForm])

    const quoteLineErrors = useMemo(() => quoteLines.map((l) => ({
        unitPrice: firstError(
            required(l.unitPrice, 'Unit price'),
            nonNegativeNumber(l.unitPrice, 'Unit price'),
        ),
        quantity: firstError(required(l.quantity, 'Quantity'), positiveNumber(l.quantity, 'Quantity')),
    })), [quoteLines])

    const openInvite = () => {
        const existing = new Set((rfq?.invitedSuppliers ?? []).map((s) => s.supplierId))
        setInviteIds([])
        setSuppliers((prev) => prev.filter((s) => !existing.has(s.value)).concat(
            prev.filter((s) => existing.has(s.value)),
        ))
        setInviteOpen(true)
    }

    const handleInvite = async () => {
        if (inviteIds.length === 0) {
            pushToast('danger', 'Validation', 'Select at least one supplier.')
            return
        }
        try {
            await rfqService.inviteSuppliers(id, inviteIds)
            pushToast('success', 'Invited', 'Suppliers invited.')
            setInviteOpen(false)
            fetchRfq()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Invite failed')
        }
    }

    const openAward = () => {
        setAwardForm({
            quotationId: comparison?.cheapestQuotationId || '',
            reason: '',
            evaluatedBy: 'current-user',
            useCheapest: false,
        })
        setAwardTouched({})
        setAwardForce(false)
        setAwardOpen(true)
        if (!comparison) {
            rfqService.getComparison(id).then(setComparison).catch(() => {})
        }
    }

    const handleCreatePoFromAward = async () => {
        if (!rfq) return
        const awards = rfq.awards ?? []
        if (awards.length === 0) return
        const latestAward = [...awards].sort(
            (a, b) => new Date(b.evaluatedAt || b.createdAt).getTime() - new Date(a.evaluatedAt || a.createdAt).getTime(),
        )[0]
        setCreatingPo(true)
        try {
            const po = await purchaseOrderService.createFromAward({
                awardId: latestAward.id,
                buyerId: rfq.buyerId,
            })
            pushToast('success', 'PO Created', `${po.poNumber} created from award.`)
            router.push(`/modules/mm/procurement/purchase-orders/${po.id}`)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', err?.response?.data?.message || 'Create PO failed')
        } finally {
            setCreatingPo(false)
        }
    }

    const handleAward = async () => {
        setAwardForce(true)
        if (Object.values(awardErrors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields.')
            return
        }
        setAwarding(true)
        try {
            await rfqService.award(id, {
                quotationId: awardForm.useCheapest ? undefined : awardForm.quotationId || undefined,
                reason: awardForm.reason,
                evaluatedBy: awardForm.evaluatedBy || undefined,
                useCheapest: awardForm.useCheapest || undefined,
            })
            pushToast('success', 'Awarded', 'RFQ awarded successfully.')
            setAwardOpen(false)
            fetchRfq()
            setTab('award')
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Award failed')
        } finally {
            setAwarding(false)
        }
    }

    const openCreateQuote = () => {
        const lines = (rfq?.lines ?? []).map((l) => ({
            key: `ql-${l.id}`,
            rfqLineId: l.id,
            materialId: l.materialId,
            quantity: String(l.quantity),
            uomId: l.uomId,
            unitPrice: '0',
            discount: '0',
            tax: '0',
            leadTimeDays: '',
            moq: '',
            warranty: '',
        }))
        setQuoteLines(lines.length ? lines : [])
        setQuoteForm({
            supplierId: '',
            validityDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            currencyId: rfq?.currencyId || '',
            paymentTermsId: '',
            deliveryTerms: '',
            freight: '0',
            tax: '0',
            notes: '',
        })
        setQuoteTouched({})
        setQuoteForce(false)
        setQuoteOpen(true)
    }

    const handleCreateQuote = async () => {
        setQuoteForce(true)
        const headerInvalid = Object.values(quoteHeaderErrors).some(Boolean)
        const linesInvalid = quoteLineErrors.some((e) => Object.values(e).some(Boolean)) || quoteLines.length === 0
        if (headerInvalid || linesInvalid) {
            pushToast('danger', 'Validation', 'Fix the highlighted fields.')
            return
        }
        setQuoteSubmitting(true)
        try {
            await quotationService.create({
                rfqId: id,
                supplierId: quoteForm.supplierId,
                validityDate: quoteForm.validityDate,
                currencyId: quoteForm.currencyId || undefined,
                paymentTermsId: quoteForm.paymentTermsId || undefined,
                deliveryTerms: quoteForm.deliveryTerms || undefined,
                freight: parseFloat(quoteForm.freight) || 0,
                tax: parseFloat(quoteForm.tax) || 0,
                notes: quoteForm.notes || undefined,
                lines: quoteLines.map((l) => ({
                    rfqLineId: l.rfqLineId || undefined,
                    materialId: l.materialId,
                    quantity: parseFloat(l.quantity) || 0,
                    uomId: l.uomId,
                    unitPrice: parseFloat(l.unitPrice) || 0,
                    discount: parseFloat(l.discount) || 0,
                    tax: parseFloat(l.tax) || 0,
                    leadTimeDays: l.leadTimeDays ? parseInt(l.leadTimeDays, 10) : undefined,
                    moq: l.moq ? parseFloat(l.moq) : undefined,
                    warranty: l.warranty?.trim() || undefined,
                })),
            })
            pushToast('success', 'Created', 'Quotation created as DRAFT.')
            setQuoteOpen(false)
            fetchRfq()
            setTab('quotations')
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Create quotation failed')
        } finally {
            setQuoteSubmitting(false)
        }
    }

    const invitedSupplierOptions = useMemo(() => {
        const invited = new Set((rfq?.invitedSuppliers ?? []).map((s) => s.supplierId))
        const quoted = new Set((rfq?.quotations ?? []).map((q) => q.supplierId))
        return suppliers.filter((s) => invited.has(s.value) && !quoted.has(s.value))
    }, [rfq, suppliers])

    const availableInviteOptions = useMemo(() => {
        const invited = new Set((rfq?.invitedSuppliers ?? []).map((s) => s.supplierId))
        return suppliers.filter((s) => !invited.has(s.value))
    }, [rfq, suppliers])

    const quotationOptions = useMemo(() => {
        const rows = comparison?.quotations ?? (rfq?.quotations ?? []).map((q) => ({
            quotationId: q.id,
            quotationNumber: q.quotationNumber,
            supplierName: q.supplier?.supplierName ?? q.supplierId,
            status: q.status,
            expired: false,
            total: Number(q.total),
        }))
        return rows
            .filter((r) => r.status === 'SUBMITTED' && !r.expired)
            .map((r) => ({
                value: r.quotationId,
                label: `${r.quotationNumber} — ${r.supplierName} (${Number(r.total).toFixed(2)})`,
            }))
    }, [comparison, rfq])

    const lineColumns = useMemo<ColumnDef<MmRfqLine>[]>(() => [
        {
            header: '#',
            accessorKey: 'lineNumber',
            size: 50,
        },
        {
            header: 'Material',
            accessorKey: 'materialId',
            cell: ({ row }) => {
                const m = row.original.material
                return m
                    ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span>
                    : <span>—</span>
            },
        },
        {
            header: 'Qty',
            accessorKey: 'quantity',
            cell: ({ row }) => <span>{Number(row.original.quantity)}</span>,
        },
        {
            header: 'UOM',
            accessorKey: 'uomId',
            cell: ({ row }) => <span>{row.original.uom?.code || '—'}</span>,
        },
        {
            header: 'Required',
            accessorKey: 'requiredDate',
            cell: ({ row }) => (
                <span className="text-xs">
                    {row.original.requiredDate ? new Date(row.original.requiredDate).toLocaleDateString() : '—'}
                </span>
            ),
        },
        {
            header: 'Specs',
            accessorKey: 'specifications',
            cell: ({ row }) => <span className="text-sm">{row.original.specifications || '—'}</span>,
        },
    ], [])

    const supplierColumns = useMemo<ColumnDef<MmRfqSupplier>[]>(() => [
        {
            header: 'Supplier',
            accessorKey: 'supplierId',
            cell: ({ row }) => {
                const s = row.original.supplier
                return s
                    ? <span className="text-sm font-medium">{s.supplierCode} — {s.supplierName}</span>
                    : <span>{row.original.supplierId}</span>
            },
        },
        {
            header: 'Invited',
            accessorKey: 'invitedAt',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.invitedAt).toLocaleString()}</span>,
        },
        {
            header: 'Response',
            accessorKey: 'responseStatus',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.responseStatus] ?? 'default'}>
                    {String(row.original.responseStatus).replace(/_/g, ' ')}
                </StatusBadge>
            ),
        },
        {
            header: 'Responded',
            accessorKey: 'respondedAt',
            cell: ({ row }) => (
                <span className="text-xs">
                    {row.original.respondedAt ? new Date(row.original.respondedAt).toLocaleString() : '—'}
                </span>
            ),
        },
    ], [])

    const quotationColumns = useMemo<ColumnDef<MmSupplierQuotation>[]>(() => [
        {
            header: 'Quotation',
            accessorKey: 'quotationNumber',
            cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.quotationNumber}</span>,
        },
        {
            header: 'Supplier',
            accessorKey: 'supplierId',
            cell: ({ row }) => {
                const s = row.original.supplier
                return s ? <span className="text-sm">{s.supplierCode} — {s.supplierName}</span> : <span>{row.original.supplierId}</span>
            },
        },
        {
            header: 'Total',
            accessorKey: 'total',
            cell: ({ row }) => <span className="font-semibold">{Number(row.original.total).toFixed(2)}</span>,
        },
        {
            header: 'Validity',
            accessorKey: 'validityDate',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.validityDate).toLocaleDateString()}</span>,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {String(row.original.status)}
                </StatusBadge>
            ),
        },
        {
            id: 'actions',
            header: '',
            size: 160,
            cell: ({ row }) => {
                const q = row.original
                return (
                    <div className="flex gap-1">
                        {q.status === 'DRAFT' && (
                            <Button
                                size="xs"
                                variant="solid"
                                onClick={async () => {
                                    try {
                                        await quotationService.submit(q.id)
                                        pushToast('success', 'Submitted', 'Quotation submitted.')
                                        fetchRfq()
                                    } catch (err: unknown) {
                                        const e = err as { response?: { data?: { message?: string } } }
                                        pushToast('danger', 'Error', e?.response?.data?.message || 'Submit failed')
                                    }
                                }}
                            >
                                Submit
                            </Button>
                        )}
                        {q.status === 'SUBMITTED' && (
                            <Button
                                size="xs"
                                onClick={async () => {
                                    try {
                                        await quotationService.withdraw(q.id)
                                        pushToast('success', 'Withdrawn', 'Quotation withdrawn.')
                                        fetchRfq()
                                    } catch (err: unknown) {
                                        const e = err as { response?: { data?: { message?: string } } }
                                        pushToast('danger', 'Error', e?.response?.data?.message || 'Withdraw failed')
                                    }
                                }}
                            >
                                Withdraw
                            </Button>
                        )}
                    </div>
                )
            },
        },
    ], [fetchRfq])

    const awardColumns = useMemo<ColumnDef<MmRfqAward>[]>(() => [
        {
            header: 'Supplier',
            accessorKey: 'supplierId',
            cell: ({ row }) => {
                const s = row.original.supplier
                return s ? <span className="text-sm font-medium">{s.supplierCode} — {s.supplierName}</span> : <span>{row.original.supplierId}</span>
            },
        },
        {
            header: 'Quotation',
            accessorKey: 'quotationId',
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.quotation?.quotationNumber || '—'}</span>,
        },
        { header: 'Reason', accessorKey: 'reason' },
        {
            header: 'Auto',
            accessorKey: 'autoSelected',
            cell: ({ row }) => <span>{row.original.autoSelected ? 'Yes' : 'No'}</span>,
        },
        {
            header: 'Evaluated',
            accessorKey: 'evaluatedAt',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.evaluatedAt).toLocaleString()}</span>,
        },
        {
            header: 'By',
            accessorKey: 'evaluatedBy',
            cell: ({ row }) => <span>{row.original.evaluatedBy || '—'}</span>,
        },
    ], [])

    const auditColumns = useMemo<ColumnDef<MmRfqAudit>[]>(() => [
        {
            header: 'Date',
            accessorKey: 'performedAt',
            cell: ({ row }) => <span className="text-xs">{new Date(row.original.performedAt).toLocaleString()}</span>,
        },
        { header: 'Action', accessorKey: 'action' },
        {
            header: 'Field',
            accessorKey: 'field',
            cell: ({ row }) => <span>{row.original.field || '—'}</span>,
        },
        {
            header: 'Old',
            accessorKey: 'oldValue',
            cell: ({ row }) => <span className="text-xs">{row.original.oldValue || '—'}</span>,
        },
        {
            header: 'New',
            accessorKey: 'newValue',
            cell: ({ row }) => <span className="text-xs">{row.original.newValue || '—'}</span>,
        },
        {
            header: 'By',
            accessorKey: 'performedBy',
            cell: ({ row }) => <span>{row.original.performedBy || '—'}</span>,
        },
    ], [])

    const comparisonColumns = useMemo<ColumnDef<RfqComparisonRow>[]>(() => [
        {
            header: 'Supplier',
            accessorKey: 'supplierName',
            cell: ({ row }) => {
                const isCheapest = comparison?.cheapestQuotationId === row.original.quotationId
                return (
                    <div className="flex flex-col">
                        <span className={`text-sm font-medium ${isCheapest ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                            {row.original.supplierCode} — {row.original.supplierName}
                        </span>
                        {isCheapest && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                                Lowest total
                            </span>
                        )}
                    </div>
                )
            },
        },
        {
            header: 'Quotation',
            accessorKey: 'quotationNumber',
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.quotationNumber}</span>,
        },
        {
            header: 'Avg Price',
            accessorKey: 'avgUnitPrice',
            cell: ({ row }) => <span>{row.original.avgUnitPrice.toFixed(2)}</span>,
        },
        {
            header: 'Total',
            accessorKey: 'total',
            cell: ({ row }) => {
                const isCheapest = comparison?.cheapestQuotationId === row.original.quotationId
                return (
                    <span className={`font-semibold ${isCheapest ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                        {row.original.total.toFixed(2)}
                    </span>
                )
            },
        },
        {
            header: 'Lead Time',
            accessorKey: 'avgLeadTimeDays',
            cell: ({ row }) => (
                <span>{row.original.avgLeadTimeDays != null ? `${row.original.avgLeadTimeDays.toFixed(0)}d` : '—'}</span>
            ),
        },
        {
            header: 'MOQ',
            accessorKey: 'maxMoq',
            cell: ({ row }) => <span>{row.original.maxMoq != null ? row.original.maxMoq : '—'}</span>,
        },
        {
            header: 'Payment',
            accessorKey: 'paymentTerms',
            cell: ({ row }) => <span className="text-xs">{row.original.paymentTerms?.name || '—'}</span>,
        },
        {
            header: 'Quality',
            accessorKey: 'qualityScore',
            cell: ({ row }) => <span>{row.original.qualityScore ?? '—'}</span>,
        },
        {
            header: 'Supplier Score',
            accessorKey: 'supplierScore',
            cell: ({ row }) => <span>{row.original.supplierScore ?? '—'}</span>,
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: ({ row }) => (
                <StatusBadge tone={STATUS_TONE[row.original.status] ?? 'default'}>
                    {String(row.original.status)}
                    {row.original.expired ? ' (EXPIRED)' : ''}
                </StatusBadge>
            ),
        },
    ], [comparison])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`${ROUTE_PATH}/${id}`, {
                detailLabel: rfq?.rfqNumber,
            }),
        [id, rfq?.rfqNumber],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!rfq) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold">RFQ not found</p>
                    <Button onClick={() => router.back()}>Go back</Button>
                </div>
            </PageContainer>
        )
    }

    const canIssue = rfq.status === 'DRAFT'
    const canEvaluate = ['ISSUED', 'PARTIALLY_RESPONDED', 'RESPONDED'].includes(rfq.status)
    const canAward = ['EVALUATION', 'RESPONDED', 'PARTIALLY_RESPONDED', 'ISSUED'].includes(rfq.status)
    const canClose = ['AWARDED', 'EVALUATION', 'RESPONDED'].includes(rfq.status)
    const canCancel = !['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)
    const canInvite = !['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)
    const canCreateQuote = ['ISSUED', 'PARTIALLY_RESPONDED', 'RESPONDED', 'EVALUATION'].includes(rfq.status)

    const lifecycleActions = (
        <div className="flex flex-wrap items-center gap-2">
            {canIssue && (
                <Button size="sm" variant="solid" icon={<HiOutlinePaperAirplane />} onClick={() => setConfirmAction({
                    action: 'Issue',
                    fn: async () => { await rfqService.issue(rfq.id) },
                })}>
                    Issue
                </Button>
            )}
            {canEvaluate && (
                <Button size="sm" variant="solid" icon={<HiOutlineScale />} onClick={() => setConfirmAction({
                    action: 'Start Evaluation',
                    fn: async () => { await rfqService.startEvaluation(rfq.id) },
                })}>
                    Start Evaluation
                </Button>
            )}
            {canAward && (
                <Button size="sm" variant="solid" icon={<HiOutlineBadgeCheck />} onClick={openAward}>
                    Award
                </Button>
            )}
            {canClose && (
                <Button size="sm" icon={<HiOutlineLockClosed />} onClick={() => setConfirmAction({
                    action: 'Close',
                    fn: async () => { await rfqService.close(rfq.id) },
                })}>
                    Close
                </Button>
            )}
            {canCancel && (
                <Button size="sm" icon={<HiOutlineBan />} onClick={() => setConfirmAction({
                    action: 'Cancel',
                    fn: async () => { await rfqService.cancel(rfq.id) },
                })}>
                    Cancel
                </Button>
            )}
        </div>
    )

    const awErr = (key: string) => visibleError(awardErrors, awardTouched, key, awardForce)
    const qhErr = (key: string) => visibleError(quoteHeaderErrors, quoteTouched, key, quoteForce)

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{rfq.rfqNumber}</span>
                        <StatusBadge tone={STATUS_TONE[rfq.status] ?? 'default'}>
                            {rfq.status.replace(/_/g, ' ')}
                        </StatusBadge>
                    </div>
                }
                description={rfq.purpose || 'Request for quotation'}
                actions={lifecycleActions}
            />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCard label="Buyer" value={rfq.buyerId} />
                <InfoCard label="Deadline" value={new Date(rfq.responseDeadline).toLocaleDateString()} />
                <InfoCard label="Currency" value={rfq.currency?.code || '—'} />
                <InfoCard label="Auto cheapest" value={rfq.autoSelectCheapest ? 'Enabled' : 'Disabled'} />
            </div>

            <AdaptiveCard className="mt-4">
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="lines" icon={<HiOutlineClipboardList />}>Lines</Tabs.TabNav>
                        <Tabs.TabNav value="suppliers" icon={<HiOutlineUsers />}>Suppliers</Tabs.TabNav>
                        <Tabs.TabNav value="quotations" icon={<HiOutlineDocumentText />}>Quotations</Tabs.TabNav>
                        <Tabs.TabNav value="comparison" icon={<HiOutlineChartBar />}>Comparison</Tabs.TabNav>
                        <Tabs.TabNav value="award" icon={<HiOutlineBadgeCheck />}>Award</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        {tab === 'lines' && (
                            <DataTable<MmRfqLine>
                                columns={lineColumns}
                                data={rfq.lines ?? []}
                                compact
                                fit
                                noData={(rfq.lines ?? []).length === 0}
                            />
                        )}

                        {tab === 'suppliers' && (
                            <div className="space-y-4">
                                {canInvite && (
                                    <div className="flex justify-end">
                                        <Button size="sm" variant="solid" icon={<HiOutlinePlus />} onClick={openInvite}>
                                            Invite Suppliers
                                        </Button>
                                    </div>
                                )}
                                <DataTable<MmRfqSupplier>
                                    columns={supplierColumns}
                                    data={rfq.invitedSuppliers ?? []}
                                    compact
                                    fit
                                    noData={(rfq.invitedSuppliers ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'quotations' && (
                            <div className="space-y-4">
                                {canCreateQuote && (
                                    <div className="flex justify-end">
                                        <Button size="sm" variant="solid" icon={<HiOutlinePlus />} onClick={openCreateQuote}>
                                            Create Quotation
                                        </Button>
                                    </div>
                                )}
                                <DataTable<MmSupplierQuotation>
                                    columns={quotationColumns}
                                    data={rfq.quotations ?? []}
                                    compact
                                    fit
                                    noData={(rfq.quotations ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'comparison' && (
                            <div className="space-y-4">
                                {comparison?.awardHint && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
                                        {comparison.awardHint}
                                        {comparison.cheapestQuotationId && (
                                            <span className="ml-1 opacity-80">
                                                (Lowest total is highlighted — not auto-selected.)
                                            </span>
                                        )}
                                    </div>
                                )}
                                <DataTable<RfqComparisonRow>
                                    columns={comparisonColumns}
                                    data={comparison?.quotations ?? []}
                                    compact
                                    fit
                                    noData={!comparison || comparison.quotations.length === 0}
                                />
                                {canAward && (
                                    <div className="flex justify-end">
                                        <Button size="sm" variant="solid" icon={<HiOutlineBadgeCheck />} onClick={openAward}>
                                            Award Winner
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'award' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap justify-end gap-2">
                                    {canAward && (rfq.awards ?? []).length === 0 && (
                                        <Button size="sm" variant="solid" icon={<HiOutlineBadgeCheck />} onClick={openAward}>
                                            Award RFQ
                                        </Button>
                                    )}
                                    {rfq.status === 'AWARDED' && (rfq.awards ?? []).length > 0 && (
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            icon={<HiOutlineDocumentDuplicate />}
                                            loading={creatingPo}
                                            onClick={handleCreatePoFromAward}
                                        >
                                            Create PO
                                        </Button>
                                    )}
                                </div>
                                <DataTable<MmRfqAward>
                                    columns={awardColumns}
                                    data={rfq.awards ?? []}
                                    compact
                                    fit
                                    noData={(rfq.awards ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'audit' && (
                            <DataTable<MmRfqAudit>
                                columns={auditColumns}
                                data={audits}
                                compact
                                fit
                                noData={audits.length === 0}
                            />
                        )}
                    </div>
                </Tabs>
            </AdaptiveCard>

            <ConfirmDialog
                isOpen={Boolean(confirmAction)}
                type="warning"
                title={`${confirmAction?.action ?? 'Confirm'}?`}
                confirmText={confirmAction?.action ?? 'Confirm'}
                onRequestClose={() => setConfirmAction(null)}
                onCancel={() => setConfirmAction(null)}
                onConfirm={runConfirm}
                confirmButtonProps={{ loading: confirming }}
            >
                <p>Are you sure you want to {confirmAction?.action?.toLowerCase()} this RFQ?</p>
            </ConfirmDialog>

            <FormDialog
                isOpen={inviteOpen}
                onClose={() => setInviteOpen(false)}
                size="sm"
                title="Invite Suppliers"
                description="Add suppliers to this RFQ invitation list."
                icon={<HiOutlineUsers />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" onClick={handleInvite}>Invite</Button>
                    </>
                }
            >
                <div className="max-h-72 space-y-2 overflow-y-auto">
                    {availableInviteOptions.length === 0 ? (
                        <p className="text-sm text-gray-400">All active suppliers are already invited.</p>
                    ) : (
                        availableInviteOptions.map((s) => (
                            <label key={s.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                <Checkbox
                                    checked={inviteIds.includes(s.value)}
                                    onChange={(checked) => {
                                        setInviteIds((prev) =>
                                            checked ? [...prev, s.value] : prev.filter((x) => x !== s.value),
                                        )
                                    }}
                                />
                                <span className="text-sm">{s.label}</span>
                            </label>
                        ))
                    )}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={awardOpen}
                onClose={() => setAwardOpen(false)}
                width={520}
                title="Award RFQ"
                description="Select a winning quotation. Cheapest is highlighted in comparison but not auto-awarded."
                icon={<HiOutlineBadgeCheck />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAwardOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={awarding} onClick={handleAward}>
                            Confirm Award
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {comparison?.awardHint && (
                        <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                            {comparison.awardHint}
                        </p>
                    )}
                    {rfq.autoSelectCheapest && (
                        <Checkbox
                            checked={awardForm.useCheapest}
                            onChange={(v) => {
                                setAwardForm((p) => ({ ...p, useCheapest: v }))
                                setAwardTouched((t) => ({ ...t, quotationId: true }))
                            }}
                        >
                            Use cheapest eligible quotation
                        </Checkbox>
                    )}
                    {!awardForm.useCheapest && (
                        <FormItem
                            label="Quotation"
                            asterisk
                            invalid={Boolean(awErr('quotationId'))}
                            errorMessage={awErr('quotationId')}
                        >
                            <Select<FilterOption>
                                options={quotationOptions}
                                value={quotationOptions.find((o) => o.value === awardForm.quotationId) ?? null}
                                onChange={(opt) => {
                                    setAwardForm((p) => ({ ...p, quotationId: opt?.value ?? '' }))
                                    setAwardTouched((t) => ({ ...t, quotationId: true }))
                                }}
                            />
                        </FormItem>
                    )}
                    <FormItem
                        label="Reason"
                        asterisk
                        invalid={Boolean(awErr('reason'))}
                        errorMessage={awErr('reason')}
                    >
                        <Input
                            textArea
                            value={awardForm.reason}
                            onChange={(e) => {
                                setAwardForm((p) => ({ ...p, reason: e.target.value }))
                                setAwardTouched((t) => ({ ...t, reason: true }))
                            }}
                            placeholder="Why was this supplier selected?"
                        />
                    </FormItem>
                    <FormItem label="Evaluated By">
                        <Input
                            value={awardForm.evaluatedBy}
                            onChange={(e) => setAwardForm((p) => ({ ...p, evaluatedBy: e.target.value }))}
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={quoteOpen}
                onClose={() => setQuoteOpen(false)}
                width={780}
                title="Create Supplier Quotation"
                description="Enter pricing for an invited supplier against this RFQ."
                icon={<HiOutlineDocumentText />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setQuoteOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={quoteSubmitting} onClick={handleCreateQuote}>
                            Create Quotation
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormItem label="Supplier" asterisk invalid={Boolean(qhErr('supplierId'))} errorMessage={qhErr('supplierId')}>
                            <Select<FilterOption>
                                options={invitedSupplierOptions}
                                value={invitedSupplierOptions.find((o) => o.value === quoteForm.supplierId) ?? null}
                                onChange={(opt) => {
                                    setQuoteForm((p) => ({ ...p, supplierId: opt?.value ?? '' }))
                                    setQuoteTouched((t) => ({ ...t, supplierId: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Validity Date" asterisk invalid={Boolean(qhErr('validityDate'))} errorMessage={qhErr('validityDate')}>
                            <Input
                                type="date"
                                value={quoteForm.validityDate}
                                onChange={(e) => {
                                    setQuoteForm((p) => ({ ...p, validityDate: e.target.value }))
                                    setQuoteTouched((t) => ({ ...t, validityDate: true }))
                                }}
                            />
                        </FormItem>
                        <FormItem label="Currency">
                            <Select<FilterOption>
                                options={currencies}
                                value={currencies.find((c) => c.value === quoteForm.currencyId) ?? null}
                                onChange={(opt) => setQuoteForm((p) => ({ ...p, currencyId: opt?.value ?? '' }))}
                                isClearable
                            />
                        </FormItem>
                        <FormItem label="Payment Terms">
                            <Select<FilterOption>
                                options={paymentTerms}
                                value={paymentTerms.find((p) => p.value === quoteForm.paymentTermsId) ?? null}
                                onChange={(opt) => setQuoteForm((p) => ({ ...p, paymentTermsId: opt?.value ?? '' }))}
                                isClearable
                            />
                        </FormItem>
                        <FormItem label="Delivery Terms">
                            <Input value={quoteForm.deliveryTerms} onChange={(e) => setQuoteForm((p) => ({ ...p, deliveryTerms: e.target.value }))} />
                        </FormItem>
                        <FormItem label="Freight">
                            <Input type="number" value={quoteForm.freight} onChange={(e) => setQuoteForm((p) => ({ ...p, freight: e.target.value }))} />
                        </FormItem>
                        <FormItem label="Tax">
                            <Input type="number" value={quoteForm.tax} onChange={(e) => setQuoteForm((p) => ({ ...p, tax: e.target.value }))} />
                        </FormItem>
                        <FormItem label="Notes" className="sm:col-span-2">
                            <Input textArea value={quoteForm.notes} onChange={(e) => setQuoteForm((p) => ({ ...p, notes: e.target.value }))} />
                        </FormItem>
                    </div>

                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Line Pricing</p>
                        {quoteLines.map((line, idx) => {
                            const le = quoteLineErrors[idx] || {}
                            const mat = rfq.lines?.find((l) => l.id === line.rfqLineId)?.material
                            return (
                                <div key={line.key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm font-semibold">
                                            {mat ? `${mat.materialCode} — ${mat.materialName}` : `Line ${idx + 1}`}
                                        </span>
                                        {quoteLines.length > 1 && (
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                icon={<HiOutlineTrash />}
                                                onClick={() => setQuoteLines((p) => p.filter((l) => l.key !== line.key))}
                                            />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <FormItem label="Qty" asterisk>
                                            <Input
                                                type="number"
                                                value={line.quantity}
                                                onChange={(e) => setQuoteLines((p) => p.map((l) => l.key === line.key ? { ...l, quantity: e.target.value } : l))}
                                            />
                                        </FormItem>
                                        <FormItem
                                            label="Unit Price"
                                            asterisk
                                            invalid={Boolean(quoteForce && le.unitPrice)}
                                            errorMessage={quoteForce ? le.unitPrice : undefined}
                                        >
                                            <Input
                                                type="number"
                                                value={line.unitPrice}
                                                onChange={(e) => setQuoteLines((p) => p.map((l) => l.key === line.key ? { ...l, unitPrice: e.target.value } : l))}
                                            />
                                        </FormItem>
                                        <FormItem label="Lead Days">
                                            <Input
                                                type="number"
                                                value={line.leadTimeDays}
                                                onChange={(e) => setQuoteLines((p) => p.map((l) => l.key === line.key ? { ...l, leadTimeDays: e.target.value } : l))}
                                            />
                                        </FormItem>
                                        <FormItem label="MOQ">
                                            <Input
                                                type="number"
                                                value={line.moq}
                                                onChange={(e) => setQuoteLines((p) => p.map((l) => l.key === line.key ? { ...l, moq: e.target.value } : l))}
                                            />
                                        </FormItem>
                                        <FormItem label="Warranty">
                                            <Input
                                                value={line.warranty}
                                                onChange={(e) => setQuoteLines((p) => p.map((l) => l.key === line.key ? { ...l, warranty: e.target.value } : l))}
                                                placeholder="e.g. 12 months"
                                            />
                                        </FormItem>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </FormDialog>
        </PageContainer>
    )
}

const InfoCard = ({ label, value }: { label: string; value: string }) => (
    <AdaptiveCard>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </AdaptiveCard>
)

export default RfqDetailPage
