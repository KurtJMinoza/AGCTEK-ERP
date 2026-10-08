'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import EllipsisButton from '@/components/shared/EllipsisButton'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Tabs from '@/components/ui/Tabs'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineClipboardList,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineDocumentText,
    HiOutlineBan,
    HiOutlineXCircle,
    HiOutlineReply,
    HiOutlineLockClosed,
    HiOutlineClipboardCheck,
    HiOutlinePaperAirplane,
    HiOutlineTruck,
    HiOutlineReceiptTax,
    HiOutlineCalculator,
    HiOutlinePaperClip,
    HiOutlineSwitchHorizontal,
    HiOutlinePlus,
    HiOutlineInboxIn,
    HiOutlineInformationCircle,
    HiOutlinePrinter,
    HiOutlineEye,
} from 'react-icons/hi'
import { purchaseOrderService } from '../services/purchaseOrderService'
import { workflowService } from '../services/workflowService'
import { goodsReceiptService } from '@/modules/mm/inventory/services/goodsReceiptService'
import { batchService, serialNumberService } from '@/modules/mm/material-master/services/referenceService'
import DocumentFlowTimeline from '@/components/shared/DocumentFlowTimeline'
import type {
    MmPurchaseOrder,
    MmPurchaseOrderLine,
    MmPurchaseOrderAudit,
    MmPurchaseOrderAttachment,
    WorkflowInstance,
    ApprovalTask,
} from '../types'
import { poInvoiceOpenQty, poOpenQty } from '../types'
import { threeWayMatchService } from '@/modules/mm/three-way-match/services/threeWayMatchService'
import { SupplierInvoicePrintHost } from '@/modules/mm/three-way-match/components/SupplierInvoicePrintHost'
import { supplierInvoiceToSlip } from '@/modules/mm/three-way-match/utils/supplierInvoiceSlipMappers'
import type { SupplierInvoiceSlipData } from '@/modules/mm/three-way-match/components/SupplierInvoiceSlip'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import useResourceAccess from '@/utils/hooks/useResourceAccess'
import { required, positiveNumber, firstError, visibleError, type FieldErrors } from '@/modules/mm/shared/formValidation'
import { useLazyMmRefs } from '@/modules/mm/shared/useLazyMmRefs'

const ROUTE_PATH = '/modules/mm/procurement/purchase-orders'

const STATUS_TONE: Record<string, 'success' | 'default' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'success',
    SENT: 'info',
    PARTIALLY_RECEIVED: 'info',
    FULLY_RECEIVED: 'success',
    CLOSED: 'default',
    CANCELLED: 'danger',
    REJECTED: 'danger',
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>{msg}</Notification>,
        { placement: 'top-end' },
    )
}

function fmtDate(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString()
}

function fmtMoney(n: number | string | null | undefined) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type GrLinePick = { value: string; label: string; maxQty: number; poLineId: string | null }

const PurchaseOrderDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string
    const { canCreate, canUpdate, canDelete } = useResourceAccess()

    const [po, setPo] = useState<MmPurchaseOrder | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('overview')
    const [audits, setAudits] = useState<MmPurchaseOrderAudit[]>([])
    const [attachments, setAttachments] = useState<MmPurchaseOrderAttachment[]>([])
    const [workflow, setWorkflow] = useState<WorkflowInstance | null>(null)
    const [confirmAction, setConfirmAction] = useState<{ action: string; fn: () => Promise<void> } | null>(null)
    const [confirming, setConfirming] = useState(false)

    const [grOpen, setGrOpen] = useState(false)
    const [grWarehouseId, setGrWarehouseId] = useState('')
    const [grSubmitting, setGrSubmitting] = useState(false)
    const [grLines, setGrLines] = useState<Record<string, string>>({})
    const [grBatchIds, setGrBatchIds] = useState<Record<string, string>>({})
    const [grSerialIds, setGrSerialIds] = useState<Record<string, string[]>>({})
    const [grBatchOpts, setGrBatchOpts] = useState<Record<string, { value: string; label: string }[]>>({})
    const [grSerialOpts, setGrSerialOpts] = useState<Record<string, { value: string; label: string }[]>>({})
    const [grRefsLoading, setGrRefsLoading] = useState(false)
    const [grTouched, setGrTouched] = useState<Record<string, boolean>>({})
    const [grForce, setGrForce] = useState(false)

    const [invOpen, setInvOpen] = useState(false)
    const [invSubmitting, setInvSubmitting] = useState(false)
    const [invDate, setInvDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [invSupplierId, setInvSupplierId] = useState('')
    const [invRemarks, setInvRemarks] = useState('')
    const [invLines, setInvLines] = useState<Record<string, string>>({})
    const [invGrLineId, setInvGrLineId] = useState<Record<string, string>>({})
    const [invGrOpts, setInvGrOpts] = useState<Record<string, GrLinePick[]>>({})
    const [invRefsLoading, setInvRefsLoading] = useState(false)
    const [invTouched, setInvTouched] = useState<Record<string, boolean>>({})
    const [invForce, setInvForce] = useState(false)
    const [invPrintSlip, setInvPrintSlip] = useState<SupplierInvoiceSlipData | null>(null)

    const [attachOpen, setAttachOpen] = useState(false)
    const [attachForm, setAttachForm] = useState({ fileName: '', fileUrl: '' })
    const [attachSubmitting, setAttachSubmitting] = useState(false)
    const [attachTouched, setAttachTouched] = useState<Record<string, boolean>>({})
    const [attachForce, setAttachForce] = useState(false)

    const [reasonOpen, setReasonOpen] = useState(false)
    const [reasonAction, setReasonAction] = useState<'reject' | 'return' | 'cancel'>('reject')
    const [reasonText, setReasonText] = useState('')
    const [reasonSubmitting, setReasonSubmitting] = useState(false)

    const [headerEditOpen, setHeaderEditOpen] = useState(false)
    const [headerSaving, setHeaderSaving] = useState(false)
    const [headerDraft, setHeaderDraft] = useState({ supplierId: '', warehouseId: '', buyerId: '' })
    const { ensure: ensurePoRefs, suppliers: supplierOpts, warehouses: warehouseOpts } = useLazyMmRefs()

    const fetchPo = useCallback(async () => {
        setLoading(true)
        try {
            const data = await purchaseOrderService.get(id)
            setPo(data)
            setWorkflow(data.workflowInstance ?? null)
            setAttachments(data.attachments ?? [])
        } catch {
            pushToast('danger', 'Error', 'Failed to load purchase order')
            setPo(null)
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchPo() }, [fetchPo])

    useEffect(() => {
        if (tab === 'audit') {
            purchaseOrderService.getAudit(id).then(setAudits).catch(() => setAudits([]))
        }
        if (tab === 'approval') {
            workflowService.getInstance('PURCHASE_ORDER', id).then(setWorkflow).catch(() => {})
        }
        if (tab === 'attachments') {
            purchaseOrderService.listAttachments(id).then(setAttachments).catch(() => setAttachments([]))
        }
    }, [tab, id])

    const runConfirm = useCallback(async () => {
        if (!confirmAction) return
        setConfirming(true)
        try {
            await confirmAction.fn()
            pushToast('success', confirmAction.action, `${confirmAction.action} completed.`)
            setConfirmAction(null)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setConfirming(false)
        }
    }, [confirmAction, fetchPo])

    const openReason = (action: 'reject' | 'return' | 'cancel') => {
        setReasonAction(action)
        setReasonText('')
        setReasonOpen(true)
    }

    const canEditPoHeader = po
        ? ['DRAFT', 'RETURNED', 'APPROVED'].includes(String(po.status))
        : false

    const openHeaderEdit = useCallback(async () => {
        if (!po) return
        await ensurePoRefs('suppliers', 'warehouses')
        setHeaderDraft({
            supplierId: po.supplierId ?? '',
            warehouseId: po.warehouseId ?? '',
            buyerId: po.buyerId ?? '',
        })
        setHeaderEditOpen(true)
    }, [po, ensurePoRefs])

    const saveHeaderEdit = async () => {
        if (!po) return
        setHeaderSaving(true)
        try {
            await purchaseOrderService.update(po.id, {
                supplierId: headerDraft.supplierId || null,
                warehouseId: headerDraft.warehouseId || null,
                buyerId: headerDraft.buyerId.trim() || po.buyerId,
            })
            pushToast('success', 'Saved', 'Draft PO header updated.')
            setHeaderEditOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Update failed')
        } finally {
            setHeaderSaving(false)
        }
    }

    const submitReason = async () => {
        if (!po) return
        setReasonSubmitting(true)
        try {
            if (reasonAction === 'reject') {
                await purchaseOrderService.reject(po.id, reasonText || 'Rejected')
            } else if (reasonAction === 'return') {
                await purchaseOrderService.returnPo(po.id, reasonText || 'Returned for revision')
            } else {
                await purchaseOrderService.cancel(po.id, reasonText || undefined)
            }
            pushToast('success', reasonAction === 'reject' ? 'Rejected' : reasonAction === 'return' ? 'Returned' : 'Cancelled', 'Done.')
            setReasonOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Action failed')
        } finally {
            setReasonSubmitting(false)
        }
    }

    const openQtyLines = useMemo(
        () => (po?.lines ?? []).filter((l) => poOpenQty(l) > 0),
        [po],
    )

    const invOpenQtyLines = useMemo(
        () => (po?.lines ?? []).filter((l) => poInvoiceOpenQty(l) > 0),
        [po],
    )

    const syncSerialSlots = useCallback((lineId: string, qty: number) => {
        const n = Math.max(0, Math.floor(qty))
        setGrSerialIds((prev) => {
            const cur = prev[lineId] ?? []
            const next = [...cur]
            while (next.length < n) next.push('')
            return { ...prev, [lineId]: next.slice(0, n) }
        })
    }, [])

    const resolveDefaultGrWarehouseId = useCallback(() => {
        if (!po) return ''
        if (po.warehouseId) return po.warehouseId
        const lineWh = [
            ...new Set(
                openQtyLines.map((l) => l.warehouseId).filter(Boolean) as string[],
            ),
        ]
        if (lineWh.length === 1) return lineWh[0]
        return ''
    }, [po, openQtyLines])

    const openGr = () => {
        void ensurePoRefs('warehouses')
        setGrWarehouseId(resolveDefaultGrWarehouseId())
        const init: Record<string, string> = {}
        const batchInit: Record<string, string> = {}
        const serialInit: Record<string, string[]> = {}
        for (const l of openQtyLines) {
            const open = poOpenQty(l)
            init[l.id] = String(open)
            batchInit[l.id] = ''
            if (l.material?.serialManaged) {
                serialInit[l.id] = Array.from({ length: open }, () => '')
            }
        }
        setGrLines(init)
        setGrBatchIds(batchInit)
        setGrSerialIds(serialInit)
        setGrTouched({})
        setGrForce(false)
        setGrOpen(true)
    }

    useEffect(() => {
        if (!grOpen || !openQtyLines.length) return
        let cancelled = false
        setGrRefsLoading(true)
        const materialIds = [...new Set(openQtyLines.map((l) => l.materialId))]
        Promise.all(
            materialIds.map(async (materialId) => {
                const line = openQtyLines.find((l) => l.materialId === materialId)
                const needsBatch = line?.material?.batchManaged
                const needsSerial = line?.material?.serialManaged
                const [batches, serials] = await Promise.all([
                    needsBatch ? batchService.list(materialId).catch(() => []) : Promise.resolve([]),
                    needsSerial ? serialNumberService.list(materialId).catch(() => []) : Promise.resolve([]),
                ])
                return {
                    materialId,
                    batches: (batches as { id: string; batchNumber: string }[]).map((b) => ({
                        value: b.id,
                        label: b.batchNumber,
                    })),
                    serials: (serials as { id: string; serialNumber: string }[]).map((s) => ({
                        value: s.id,
                        label: s.serialNumber,
                    })),
                }
            }),
        )
            .then((rows) => {
                if (cancelled) return
                const batchMap: Record<string, { value: string; label: string }[]> = {}
                const serialMap: Record<string, { value: string; label: string }[]> = {}
                for (const l of openQtyLines) {
                    const row = rows.find((r) => r.materialId === l.materialId)
                    if (row) {
                        batchMap[l.id] = row.batches
                        serialMap[l.id] = row.serials
                    }
                }
                setGrBatchOpts(batchMap)
                setGrSerialOpts(serialMap)
            })
            .finally(() => {
                if (!cancelled) setGrRefsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [grOpen, openQtyLines])

    const grErrors = useMemo<FieldErrors>(() => {
        const errs: FieldErrors = {
            warehouseId: required(grWarehouseId, 'Receiving warehouse'),
        }
        for (const l of openQtyLines) {
            const qty = grLines[l.id] ?? ''
            errs[l.id] = firstError(required(qty, 'Qty'), positiveNumber(qty, 'Qty'))
            const n = Number(qty)
            if (!errs[l.id] && n > poOpenQty(l)) {
                errs[l.id] = `Cannot exceed open qty ${poOpenQty(l)}`
            }
            if (l.material?.batchManaged && n > 0) {
                const b = grBatchIds[l.id]
                if (!b) errs[`batch-${l.id}`] = 'Batch is required'
            }
            if (l.material?.serialManaged && n > 0) {
                const picks = grSerialIds[l.id] ?? []
                if (picks.length !== n) {
                    errs[`serial-${l.id}`] = `Select ${n} serial number(s)`
                } else {
                    const missing = picks.some((id) => !id)
                    const dup = new Set(picks.filter(Boolean)).size !== picks.filter(Boolean).length
                    if (missing) errs[`serial-${l.id}`] = 'Each unit needs a serial'
                    if (dup) errs[`serial-${l.id}`] = 'Duplicate serial on this line'
                }
            }
        }
        return errs
    }, [openQtyLines, grLines, grBatchIds, grSerialIds, grWarehouseId])

    const handleCreateGr = async () => {
        if (!po) return
        setGrForce(true)
        if (Object.values(grErrors).some(Boolean)) {
            pushToast(
                'danger',
                'Validation',
                grErrors.warehouseId
                    ? 'Choose a receiving warehouse (or set one on the PO under Edit draft).'
                    : 'Fix receipt quantities.',
            )
            return
        }
        setGrSubmitting(true)
        try {
            const selected = openQtyLines.filter((l) => Number(grLines[l.id]) > 0)
            if (selected.length === 0) {
                pushToast('danger', 'Validation', 'Enter at least one quantity.')
                return
            }
            const today = new Date().toISOString().slice(0, 10)
            const grPayloadLines: Array<{
                materialId: string
                quantity: number
                uomId: string
                unitCost: number
                totalCost: number
                purchaseOrderLineId: string
                storageBinId?: string
                batchId?: string
                serialNumberId?: string
            }> = []

            for (const l of selected) {
                const qty = Number(grLines[l.id])
                const unitCost = Number(l.unitPrice)
                const base = {
                    materialId: l.materialId,
                    uomId: l.uomId,
                    unitCost,
                    purchaseOrderLineId: l.id,
                    storageBinId: l.storageBinId || undefined,
                }
                if (l.material?.serialManaged) {
                    const serials = grSerialIds[l.id] ?? []
                    for (const serialNumberId of serials) {
                        grPayloadLines.push({
                            ...base,
                            quantity: 1,
                            totalCost: unitCost,
                            serialNumberId,
                        })
                    }
                } else {
                    grPayloadLines.push({
                        ...base,
                        quantity: qty,
                        totalCost: qty * unitCost,
                        batchId: l.material?.batchManaged
                            ? grBatchIds[l.id] || undefined
                            : undefined,
                    })
                }
            }

            const warehouseId =
                grWarehouseId.trim()
                || po.warehouseId
                || selected.map((l) => l.warehouseId).find(Boolean)
                || ''
            const gr = await goodsReceiptService.create({
                companyId: po.companyId,
                warehouseId,
                purchaseOrderId: po.id,
                postingDate: today,
                documentDate: today,
                stockStatus: 'UNRESTRICTED',
                remarks: `GR against ${po.poNumber}`,
                lines: grPayloadLines,
            })
            await goodsReceiptService.post(gr.id)
            pushToast('success', 'Received', `${gr.documentNumber} created and posted.`)
            setGrOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string | string[] } } }
            const msg = e?.response?.data?.message || 'Goods receipt failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setGrSubmitting(false)
        }
    }

    const openInvPrint = useCallback(async (invoiceId: string) => {
        try {
            const inv = await threeWayMatchService.getInvoice(invoiceId)
            setInvPrintSlip(supplierInvoiceToSlip(inv))
        } catch {
            pushToast('danger', 'Error', 'Failed to load invoice for printing')
        }
    }, [])

    const openSupplierInvoice = useCallback(async () => {
        if (!po) return
        if (!po.supplierId) {
            await ensurePoRefs('suppliers')
        }
        setInvDate(new Date().toISOString().slice(0, 10))
        setInvSupplierId(po.supplierId ?? '')
        setInvRemarks('')
        setInvTouched({})
        setInvForce(false)
        setInvRefsLoading(true)
        setInvOpen(true)
        try {
            const res = await goodsReceiptService.list({
                purchaseOrderId: po.id,
                status: 'POSTED',
                pageSize: 100,
            })
            const receipts = (res.data ?? []) as GoodsReceipt[]
            const optsByPoLine: Record<string, GrLinePick[]> = {}
            const initQty: Record<string, string> = {}
            const initGr: Record<string, string> = {}
            for (const l of invOpenQtyLines) {
                const open = poInvoiceOpenQty(l)
                initQty[l.id] = String(open)
                const picks: GrLinePick[] = []
                for (const gr of receipts) {
                    for (const gl of gr.lines ?? []) {
                        if (
                            gl.purchaseOrderLineId
                            && gl.purchaseOrderLineId !== l.id
                        ) {
                            continue
                        }
                        if (!gl.purchaseOrderLineId && l.materialId !== gl.materialId) {
                            continue
                        }
                        picks.push({
                            value: gl.id,
                            label: `${gr.documentNumber} · ${gl.material?.materialCode ?? gl.materialId} · qty ${Number(gl.quantity)}`,
                            maxQty: Number(gl.quantity),
                            poLineId: gl.purchaseOrderLineId ?? null,
                        })
                    }
                }
                optsByPoLine[l.id] = picks
                initGr[l.id] = picks[0]?.value ?? ''
            }
            setInvGrOpts(optsByPoLine)
            setInvLines(initQty)
            setInvGrLineId(initGr)
        } catch {
            pushToast('danger', 'Error', 'Could not load posted goods receipts for this PO.')
            setInvGrOpts({})
            setInvLines({})
            setInvGrLineId({})
        } finally {
            setInvRefsLoading(false)
        }
    }, [po, invOpenQtyLines, ensurePoRefs])

    const invErrors = useMemo<FieldErrors>(() => {
        const errs: FieldErrors = {}
        const supplierId = po?.supplierId || invSupplierId
        if (!supplierId) {
            errs.supplierId = 'Supplier is required for supplier invoices'
        }
        for (const l of invOpenQtyLines) {
            const qty = invLines[l.id] ?? ''
            errs[l.id] = firstError(required(qty, 'Qty'), positiveNumber(qty, 'Qty'))
            const n = Number(qty)
            if (!errs[l.id] && n > poInvoiceOpenQty(l)) {
                errs[l.id] = `Cannot exceed invoice-open qty ${poInvoiceOpenQty(l)}`
            }
            if (n > 0) {
                const grId = invGrLineId[l.id]
                if (!grId) {
                    errs[`gr-${l.id}`] = 'Select a goods receipt line'
                } else {
                    const pick = (invGrOpts[l.id] ?? []).find((o) => o.value === grId)
                    if (pick && n > pick.maxQty) {
                        errs[l.id] = `GR line allows max ${pick.maxQty}`
                    }
                }
            }
        }
        return errs
    }, [po, invOpenQtyLines, invLines, invGrLineId, invGrOpts, invSupplierId])

    const handleCreateSupplierInvoice = async () => {
        if (!po) return
        setInvForce(true)
        if (Object.values(invErrors).some(Boolean)) {
            pushToast(
                'danger',
                'Validation',
                invErrors.supplierId
                    ? 'Assign a supplier on the PO (Edit draft) or select one below.'
                    : 'Fix invoice quantities and GR allocations.',
            )
            return
        }
        const supplierId = po.supplierId || invSupplierId
        setInvSubmitting(true)
        try {
            const selected = invOpenQtyLines.filter((l) => Number(invLines[l.id]) > 0)
            if (selected.length === 0) {
                pushToast('danger', 'Validation', 'Enter at least one invoiced quantity.')
                return
            }
            const payloadLines = selected.map((l) => {
                const qty = Number(invLines[l.id])
                const ordered = Number(l.quantity) || 1
                const taxShare = (Number(l.tax || 0) / ordered) * qty
                const grLineId = invGrLineId[l.id]
                return {
                    materialId: l.materialId,
                    purchaseOrderLineId: l.id,
                    uomId: l.uomId,
                    invoicedQuantity: qty,
                    unitPrice: Number(l.unitPrice),
                    taxAmount: taxShare,
                    receipts: [
                        {
                            goodsReceiptLineId: grLineId,
                            allocatedQuantity: qty,
                        },
                    ],
                }
            })
            const inv = await threeWayMatchService.createInvoice({
                companyId: po.companyId,
                supplierId,
                purchaseOrderId: po.id,
                currencyId: po.currencyId || undefined,
                invoiceDate: invDate,
                remarks: invRemarks.trim() || undefined,
                lines: payloadLines,
            })
            await threeWayMatchService.submitInvoice(inv.id)
            const full = await threeWayMatchService.getInvoice(inv.id)
            setInvPrintSlip(supplierInvoiceToSlip(full))
            pushToast(
                'success',
                'Supplier invoice',
                `${inv.invoiceNumber} created — print your copy or continue matching.`,
            )
            setInvOpen(false)
            fetchPo()
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string | string[] } } }
            const msg = e?.response?.data?.message || 'Supplier invoice failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setInvSubmitting(false)
        }
    }

    const attachErrors = useMemo<FieldErrors>(() => ({
        fileName: required(attachForm.fileName, 'File name'),
    }), [attachForm])

    const handleAttach = async () => {
        setAttachForce(true)
        if (Object.values(attachErrors).some(Boolean)) return
        setAttachSubmitting(true)
        try {
            await purchaseOrderService.addAttachment(id, {
                fileName: attachForm.fileName,
                fileUrl: attachForm.fileUrl || undefined,
            })
            pushToast('success', 'Attached', 'Attachment added.')
            setAttachOpen(false)
            setAttachForm({ fileName: '', fileUrl: '' })
            const list = await purchaseOrderService.listAttachments(id)
            setAttachments(list)
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } }
            pushToast('danger', 'Error', e?.response?.data?.message || 'Upload failed')
        } finally {
            setAttachSubmitting(false)
        }
    }

    const lineColumns = useMemo<ColumnDef<MmPurchaseOrderLine>[]>(() => [
        {
            header: '#',
            accessorKey: 'lineNumber',
            size: 50,
        },
        {
            header: 'Material',
            id: 'material',
            cell: ({ row }) => {
                const m = row.original.material
                return m
                    ? <span className="text-sm font-medium">{m.materialCode} — {m.materialName}</span>
                    : <span>{row.original.materialId}</span>
            },
        },
        { header: 'Qty', accessorKey: 'quantity', cell: ({ row }) => <span>{Number(row.original.quantity)}</span> },
        { header: 'UOM', id: 'uom', cell: ({ row }) => <span>{row.original.uom?.code || '—'}</span> },
        { header: 'Unit Price', accessorKey: 'unitPrice', cell: ({ row }) => <span>{fmtMoney(row.original.unitPrice)}</span> },
        { header: 'Discount', accessorKey: 'discount', cell: ({ row }) => <span>{fmtMoney(row.original.discount)}</span> },
        { header: 'Tax', accessorKey: 'tax', cell: ({ row }) => <span>{fmtMoney(row.original.tax)}</span> },
        { header: 'Freight', accessorKey: 'freight', cell: ({ row }) => <span>{fmtMoney(row.original.freight)}</span> },
        { header: 'Line Total', accessorKey: 'lineTotal', cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.lineTotal)}</span> },
        { header: 'Received', accessorKey: 'receivedQuantity', cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span> },
        { header: 'Invoiced', accessorKey: 'invoicedQuantity', cell: ({ row }) => <span>{Number(row.original.invoicedQuantity || 0)}</span> },
    ], [])

    const deliveryColumns = useMemo<ColumnDef<MmPurchaseOrderLine>[]>(() => [
        { header: '#', accessorKey: 'lineNumber', size: 50 },
        {
            header: 'Material',
            id: 'material',
            cell: ({ row }) => (
                <span className="text-sm">
                    {row.original.material?.materialCode ?? row.original.materialId}
                </span>
            ),
        },
        {
            header: 'Warehouse',
            id: 'wh',
            cell: ({ row }) => <span>{row.original.warehouse?.name || po?.warehouse?.name || '—'}</span>,
        },
        {
            header: 'Bin',
            id: 'bin',
            cell: ({ row }) => <span>{row.original.storageBin?.code || '—'}</span>,
        },
        {
            header: 'Required',
            accessorKey: 'requiredDate',
            cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.requiredDate)}</span>,
        },
        {
            header: 'Expected',
            accessorKey: 'expectedDeliveryDate',
            cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.expectedDeliveryDate)}</span>,
        },
        {
            header: 'Open Qty',
            id: 'open',
            cell: ({ row }) => <span className="font-medium text-primary">{poOpenQty(row.original)}</span>,
        },
    ], [po])

    const auditColumns = useMemo<ColumnDef<MmPurchaseOrderAudit>[]>(() => [
        { header: 'Date', accessorKey: 'performedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.performedAt).toLocaleString()}</span> },
        { header: 'Action', accessorKey: 'action' },
        { header: 'Field', accessorKey: 'field', cell: ({ row }) => <span>{row.original.field || '—'}</span> },
        { header: 'Old', accessorKey: 'oldValue', cell: ({ row }) => <span className="text-xs">{row.original.oldValue || '—'}</span> },
        { header: 'New', accessorKey: 'newValue', cell: ({ row }) => <span className="text-xs">{row.original.newValue || '—'}</span> },
        { header: 'By', accessorKey: 'performedBy', cell: ({ row }) => <span>{row.original.performedBy || '—'}</span> },
    ], [])

    const attachColumns = useMemo<ColumnDef<MmPurchaseOrderAttachment>[]>(() => [
        { header: 'File', accessorKey: 'fileName' },
        {
            header: 'URL',
            accessorKey: 'fileUrl',
            cell: ({ row }) => row.original.fileUrl
                ? <a href={row.original.fileUrl} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">Open</a>
                : <span>—</span>,
        },
        { header: 'Uploaded By', accessorKey: 'uploadedBy', cell: ({ row }) => <span>{row.original.uploadedBy || '—'}</span> },
        { header: 'When', accessorKey: 'uploadedAt', cell: ({ row }) => <span className="text-xs">{new Date(row.original.uploadedAt).toLocaleString()}</span> },
        {
            id: 'actions',
            header: '',
            size: 80,
            cell: ({ row }) => canDelete && (
                <Button
                    size="xs"
                    variant="plain"
                    onClick={async () => {
                        try {
                            await purchaseOrderService.deleteAttachment(id, row.original.id)
                            setAttachments((prev) => prev.filter((a) => a.id !== row.original.id))
                            pushToast('success', 'Deleted', 'Attachment removed.')
                        } catch {
                            pushToast('danger', 'Error', 'Delete failed')
                        }
                    }}
                >
                    Remove
                </Button>
            ),
        },
    ], [id, canDelete])

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(`${ROUTE_PATH}/${id}`, {
                detailLabel: po?.poNumber,
            }),
        [id, po?.poNumber],
    )

    if (loading) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 items-center justify-center"><Spinner size={40} /></div>
            </PageContainer>
        )
    }

    if (!po) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold">Purchase order not found</p>
                    <Button onClick={() => router.back()}>Go back</Button>
                </div>
            </PageContainer>
        )
    }

    const hasReceipts = (po.goodsReceipts ?? []).length > 0
        || (po.lines ?? []).some((l) => Number(l.receivedQuantity || 0) > 0)
    const canCancel = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'].includes(String(po.status)) && !hasReceipts
    const canClose = ['FULLY_RECEIVED', 'PARTIALLY_RECEIVED'].includes(String(po.status))
    const canReceive = ['SENT', 'PARTIALLY_RECEIVED', 'APPROVED'].includes(String(po.status)) && openQtyLines.length > 0
    const hasPostedGr = (po.goodsReceipts ?? []).some((g) => g.status === 'POSTED')
        || (po.lines ?? []).some((l) => Number(l.receivedQuantity || 0) > 0)
    const canCreateInvoice = hasPostedGr && invOpenQtyLines.length > 0

    const tasks: ApprovalTask[] = workflow?.tasks ?? po.workflowInstance?.tasks ?? []

    const lifecycleActions = (
        <div className="flex flex-wrap items-center gap-2">
            {canUpdate && canEditPoHeader && (
                <Button size="sm" icon={<HiOutlineDocumentText />} onClick={() => void openHeaderEdit()}>
                    Edit draft
                </Button>
            )}
            {po.status === 'DRAFT' && (
                <>
                    <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={() => setConfirmAction({
                        action: 'Submit',
                        fn: async () => { await purchaseOrderService.submit(po.id) },
                    })}>
                        Submit
                    </Button>
                </>
            )}
            {po.status === 'PENDING_APPROVAL' && (
                <>
                    <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction({
                        action: 'Approve',
                        fn: async () => { await purchaseOrderService.approve(po.id) },
                    })}>
                        Approve
                    </Button>
                    <Button size="sm" icon={<HiOutlineXCircle />} onClick={() => openReason('reject')}>
                        Reject
                    </Button>
                    <Button size="sm" icon={<HiOutlineReply />} onClick={() => openReason('return')}>
                        Return
                    </Button>
                </>
            )}
            {po.status === 'APPROVED' && (
                <Button
                    size="sm"
                    variant="solid"
                    icon={<HiOutlinePaperAirplane />}
                    onClick={() => setConfirmAction({
                        action: 'Send',
                        fn: async () => { await purchaseOrderService.send(po.id) },
                    })}
                >
                    Send
                </Button>
            )}
            {canCancel && (
                <Button size="sm" icon={<HiOutlineBan />} onClick={() => openReason('cancel')}>
                    Cancel
                </Button>
            )}
            {canClose && (
                <Button size="sm" icon={<HiOutlineLockClosed />} onClick={() => setConfirmAction({
                    action: 'Close',
                    fn: async () => { await purchaseOrderService.close(po.id) },
                })}>
                    Close
                </Button>
            )}
        </div>
    )

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <PageHeader
                title={
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{po.poNumber}</span>
                        <StatusBadge tone={STATUS_TONE[po.status] ?? 'default'}>
                            {String(po.status).replace(/_/g, ' ')}
                        </StatusBadge>
                    </div>
                }
                description={
                    po.supplier
                        ? `${po.supplier.supplierCode} — ${po.supplier.supplierName}`
                        : 'No supplier assigned (optional — use Edit draft anytime)'
                }
                actions={lifecycleActions}
            />

            <AdaptiveCard className="mt-4">
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.TabList className="!overflow-x-auto">
                        <Tabs.TabNav value="overview" icon={<HiOutlineInformationCircle />}>Overview</Tabs.TabNav>
                        <Tabs.TabNav value="items" icon={<HiOutlineClipboardList />}>Items</Tabs.TabNav>
                        <Tabs.TabNav value="delivery" icon={<HiOutlineTruck />}>Delivery</Tabs.TabNav>
                        <Tabs.TabNav value="approval" icon={<HiOutlineCheckCircle />}>Approval</Tabs.TabNav>
                        <Tabs.TabNav value="receiving" icon={<HiOutlineInboxIn />}>Receiving</Tabs.TabNav>
                        <Tabs.TabNav value="invoice" icon={<HiOutlineReceiptTax />}>Invoice</Tabs.TabNav>
                        <Tabs.TabNav value="accounting" icon={<HiOutlineCalculator />}>Accounting</Tabs.TabNav>
                        <Tabs.TabNav value="attachments" icon={<HiOutlinePaperClip />}>Attachments</Tabs.TabNav>
                        <Tabs.TabNav value="audit" icon={<HiOutlineClock />}>Audit</Tabs.TabNav>
                        <Tabs.TabNav value="flow" icon={<HiOutlineSwitchHorizontal />}>Document Flow</Tabs.TabNav>
                    </Tabs.TabList>

                    <div className="p-5">
                        {tab === 'overview' && (
                            <div className="space-y-4">
                                {!po.supplierId && (
                                    <AdaptiveCard className="!border-gray-200 !bg-gray-50 dark:!border-gray-600 dark:!bg-gray-800/40">
                                        <p className="text-sm text-gray-700 dark:text-gray-200">
                                            Supplier is optional. Use <strong>Edit draft</strong> to assign one when needed (e.g. expected receipt from PO, supplier invoices, 3-way match).
                                        </p>
                                    </AdaptiveCard>
                                )}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoCard label="Company" value={po.company?.name || po.companyId} />
                                    <InfoCard
                                        label="Supplier"
                                        value={
                                            po.supplier
                                                ? `${po.supplier.supplierCode} — ${po.supplier.supplierName}`
                                                : '—'
                                        }
                                    />
                                    <InfoCard label="Buyer" value={po.buyerId} />
                                    <InfoCard label="Warehouse" value={po.warehouse?.name || '—'} />
                                    <InfoCard label="Currency" value={po.currency?.code || '—'} />
                                    <InfoCard label="Total Amount" value={fmtMoney(po.totalAmount)} />
                                    <InfoCard label="Expected Delivery" value={fmtDate(po.expectedDeliveryDate)} />
                                    <InfoCard label="Payment Terms" value={po.paymentTerms?.name || '—'} />
                                    <InfoCard label="Delivery Terms" value={po.deliveryTerms || '—'} />
                                    <InfoCard label="Created" value={fmtDate(po.createdAt)} />
                                    <InfoCard label="Submitted" value={fmtDate(po.submittedAt)} />
                                    <InfoCard label="Approved" value={fmtDate(po.approvedAt)} />
                                    <InfoCard label="Sent" value={fmtDate(po.sentAt)} />
                                </div>
                                {(po.rejectionReason || po.returnedReason || po.cancelReason) && (
                                    <AdaptiveCard>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                            {po.rejectionReason || po.returnedReason || po.cancelReason}
                                        </p>
                                    </AdaptiveCard>
                                )}
                            </div>
                        )}

                        {tab === 'items' && (
                            <DataTable<MmPurchaseOrderLine>
                                columns={lineColumns}
                                data={po.lines ?? []}
                                compact
                                fit
                                noData={(po.lines ?? []).length === 0}
                            />
                        )}

                        {tab === 'delivery' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <InfoCard label="Header Warehouse" value={po.warehouse?.name || '—'} />
                                    <InfoCard label="Expected Delivery" value={fmtDate(po.expectedDeliveryDate)} />
                                    <InfoCard label="Delivery Terms" value={po.deliveryTerms || '—'} />
                                </div>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={deliveryColumns}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'approval' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <InfoCard label="Workflow Status" value={workflow?.status || po.workflowInstance?.status || '—'} />
                                    <InfoCard label="Initiated By" value={workflow?.initiatedBy || '—'} />
                                    <InfoCard label="Approved By" value={po.approvedBy || '—'} />
                                    <InfoCard label="Rejection / Return" value={po.rejectionReason || po.returnedReason || '—'} />
                                </div>
                                {po.status === 'PENDING_APPROVAL' && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="solid" icon={<HiOutlineCheckCircle />} onClick={() => setConfirmAction({
                                            action: 'Approve',
                                            fn: async () => { await purchaseOrderService.approve(po.id) },
                                        })}>
                                            Approve
                                        </Button>
                                        <Button size="sm" icon={<HiOutlineXCircle />} onClick={() => openReason('reject')}>Reject</Button>
                                        <Button size="sm" icon={<HiOutlineReply />} onClick={() => openReason('return')}>Return</Button>
                                    </div>
                                )}
                                {tasks.length === 0 ? (
                                    <p className="text-sm text-gray-500">No approval tasks yet. Submit the PO to start the workflow.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-600">
                                                    <th className="pb-2 pr-4">Step</th>
                                                    <th className="pb-2 pr-4">Role</th>
                                                    <th className="pb-2 pr-4">Status</th>
                                                    <th className="pb-2 pr-4">Comment</th>
                                                    <th className="pb-2">Decided</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tasks.map((t) => (
                                                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="py-2 pr-4">{t.stepNumber}</td>
                                                        <td className="py-2 pr-4">{t.approverRole}</td>
                                                        <td className="py-2 pr-4">
                                                            <StatusBadge tone={t.status === 'APPROVED' ? 'success' : t.status === 'REJECTED' || t.status === 'RETURNED' ? 'danger' : 'warning'}>
                                                                {t.status}
                                                            </StatusBadge>
                                                        </td>
                                                        <td className="py-2 pr-4">{t.comment || '—'}</td>
                                                        <td className="py-2 text-xs">{t.decidedAt ? new Date(t.decidedAt).toLocaleString() : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === 'receiving' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-gray-500">
                                        Open quantity across lines:{' '}
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                            {openQtyLines.reduce((s, l) => s + poOpenQty(l), 0)}
                                        </span>
                                    </p>
                                    {canReceive && (
                                        <Button size="sm" variant="solid" icon={<HiOutlineInboxIn />} onClick={openGr}>
                                            Create Goods Receipt
                                        </Button>
                                    )}
                                </div>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={[
                                        { header: '#', accessorKey: 'lineNumber', size: 50 },
                                        {
                                            header: 'Material',
                                            id: 'm',
                                            cell: ({ row }) => (
                                                <span className="text-sm">
                                                    {row.original.material?.materialCode ?? row.original.materialId}
                                                </span>
                                            ),
                                        },
                                        { header: 'Ordered', accessorKey: 'quantity', cell: ({ row }) => <span>{Number(row.original.quantity)}</span> },
                                        { header: 'Received', accessorKey: 'receivedQuantity', cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span> },
                                        { header: 'Open', id: 'open', cell: ({ row }) => <span className="font-medium text-primary">{poOpenQty(row.original)}</span> },
                                    ]}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Receipt History</p>
                                    {(po.goodsReceipts ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500">No goods receipts yet.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {(po.goodsReceipts ?? []).map((gr) => (
                                                <li key={gr.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600">
                                                    <span className="font-mono font-semibold">{gr.documentNumber}</span>
                                                    <StatusBadge tone={gr.status === 'POSTED' ? 'success' : 'default'}>{gr.status}</StatusBadge>
                                                    <span className="text-xs text-gray-500">{fmtDate(gr.postingDate)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

                        {tab === 'invoice' && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-gray-500">
                                        Invoice-open qty (received − invoiced):{' '}
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                                            {invOpenQtyLines.reduce((s, l) => s + poInvoiceOpenQty(l), 0)}
                                        </span>
                                    </p>
                                    {canCreateInvoice ? (
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            icon={<HiOutlineReceiptTax />}
                                            onClick={() => void openSupplierInvoice()}
                                        >
                                            Create Supplier Invoice
                                        </Button>
                                    ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <InfoCard
                                        label="Ordered Qty"
                                        value={String((po.lines ?? []).reduce((s, l) => s + Number(l.quantity), 0))}
                                    />
                                    <InfoCard
                                        label="Received Qty"
                                        value={String((po.lines ?? []).reduce((s, l) => s + Number(l.receivedQuantity || 0), 0))}
                                    />
                                    <InfoCard
                                        label="Invoiced Qty"
                                        value={String((po.lines ?? []).reduce((s, l) => s + Number(l.invoicedQuantity || 0), 0))}
                                    />
                                </div>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={[
                                        { header: '#', accessorKey: 'lineNumber', size: 50 },
                                        {
                                            header: 'Material',
                                            id: 'm',
                                            cell: ({ row }) => (
                                                <span className="text-sm">
                                                    {row.original.material?.materialCode ?? row.original.materialId}
                                                </span>
                                            ),
                                        },
                                        { header: 'Ordered', accessorKey: 'quantity', cell: ({ row }) => <span>{Number(row.original.quantity)}</span> },
                                        { header: 'Received', accessorKey: 'receivedQuantity', cell: ({ row }) => <span>{Number(row.original.receivedQuantity || 0)}</span> },
                                        { header: 'Invoiced', accessorKey: 'invoicedQuantity', cell: ({ row }) => <span>{Number(row.original.invoicedQuantity || 0)}</span> },
                                        { header: 'Open to invoice', id: 'openInv', cell: ({ row }) => <span className="font-medium text-primary">{poInvoiceOpenQty(row.original)}</span> },
                                    ]}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Invoice History</p>
                                    {(po.supplierInvoices ?? []).length === 0 ? (
                                        <p className="text-sm text-gray-500">No supplier invoices yet. Post a goods receipt first, then create an invoice here.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {(po.supplierInvoices ?? []).map((inv) => (
                                                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-600">
                                                    <Link
                                                        href={`/modules/mm/procurement/supplier-invoices?invoiceId=${inv.id}`}
                                                        className="font-mono font-semibold text-primary hover:underline"
                                                    >
                                                        {inv.invoiceNumber}
                                                    </Link>
                                                    <StatusBadge tone={inv.status === 'DRAFT' ? 'default' : inv.matchStatus === 'MATCHED' ? 'success' : 'warning'}>
                                                        {inv.matchStatus ? `${inv.status} / ${inv.matchStatus}` : inv.status}
                                                    </StatusBadge>
                                                    <span className="text-xs text-gray-500">{fmtMoney(inv.totalAmount)}</span>
                                                    <span className="text-xs text-gray-500">{fmtDate(inv.invoiceDate)}</span>
                                                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                                                        <Dropdown.Item
                                                            eventKey="view"
                                                            onClick={() =>
                                                                router.push(
                                                                    `/modules/mm/procurement/supplier-invoices?invoiceId=${inv.id}`,
                                                                )
                                                            }
                                                        >
                                                            <HiOutlineEye className="mr-2 text-base" />
                                                            View details
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            eventKey="print"
                                                            onClick={() => void openInvPrint(inv.id)}
                                                        >
                                                            <HiOutlinePrinter className="mr-2 text-base" />
                                                            Print invoice
                                                        </Dropdown.Item>
                                                        {inv.status === 'SUBMITTED' && (
                                                            <Dropdown.Item
                                                                eventKey="match"
                                                                onClick={async () => {
                                                                    try {
                                                                        await threeWayMatchService.runMatch(inv.id)
                                                                        pushToast('success', 'Match', 'Three-way match completed.')
                                                                        fetchPo()
                                                                    } catch (err: unknown) {
                                                                        const e = err as { response?: { data?: { message?: string } } }
                                                                        pushToast('danger', 'Error', e?.response?.data?.message || 'Match failed')
                                                                    }
                                                                }}
                                                            >
                                                                Run match
                                                            </Dropdown.Item>
                                                        )}
                                                    </Dropdown>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <AdaptiveCard>
                                    <div className="flex flex-wrap items-center gap-2 p-2">
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            onClick={() => router.push('/modules/mm/procurement/supplier-invoices')}
                                        >
                                            All supplier invoices
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            onClick={() => router.push('/modules/mm/procurement/three-way-match')}
                                        >
                                            Match exceptions
                                        </Button>
                                    </div>
                                </AdaptiveCard>
                            </div>
                        )}

                        {tab === 'accounting' && (
                            <div className="space-y-4">
                                <AdaptiveCard>
                                    <p className="mb-2 text-sm font-medium">Posting keys / cost objects (placeholder)</p>
                                    <p className="text-sm text-gray-500">
                                        Cost center, project, and GL posting key rollup will appear here once FI integration is wired.
                                    </p>
                                </AdaptiveCard>
                                <DataTable<MmPurchaseOrderLine>
                                    columns={[
                                        { header: '#', accessorKey: 'lineNumber', size: 50 },
                                        {
                                            header: 'Material',
                                            id: 'm',
                                            cell: ({ row }) => (
                                                <span className="text-sm">
                                                    {row.original.material?.materialCode ?? row.original.materialId}
                                                </span>
                                            ),
                                        },
                                        { header: 'Cost Center', accessorKey: 'costCenterId', cell: ({ row }) => <span>{row.original.costCenterId || '—'}</span> },
                                        { header: 'Project', accessorKey: 'projectId', cell: ({ row }) => <span>{row.original.projectId || '—'}</span> },
                                        { header: 'Line Total', accessorKey: 'lineTotal', cell: ({ row }) => <span>{fmtMoney(row.original.lineTotal)}</span> },
                                    ]}
                                    data={po.lines ?? []}
                                    compact
                                    fit
                                    noData={(po.lines ?? []).length === 0}
                                />
                            </div>
                        )}

                        {tab === 'attachments' && (
                            <div className="space-y-4">
                                {canCreate && (
                                    <div className="flex justify-end">
                                        <Button size="sm" icon={<HiOutlinePlus />} onClick={() => {
                                            setAttachForm({ fileName: '', fileUrl: '' })
                                            setAttachTouched({})
                                            setAttachForce(false)
                                            setAttachOpen(true)
                                        }}>
                                            Add Attachment
                                        </Button>
                                    </div>
                                )}
                                <DataTable<MmPurchaseOrderAttachment>
                                    columns={attachColumns}
                                    data={attachments}
                                    compact
                                    fit
                                    noData={attachments.length === 0}
                                />
                            </div>
                        )}

                        {tab === 'audit' && (
                            <DataTable<MmPurchaseOrderAudit>
                                columns={auditColumns}
                                data={audits}
                                compact
                                fit
                                noData={audits.length === 0}
                            />
                        )}

                        {tab === 'flow' && (
                            <DocumentFlowTimeline
                                documentType="PURCHASE_ORDER"
                                documentId={id}
                                companyId={po?.companyId}
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
                <p>Are you sure you want to {confirmAction?.action?.toLowerCase()} this purchase order?</p>
            </ConfirmDialog>

            <FormDialog
                isOpen={reasonOpen}
                onClose={() => setReasonOpen(false)}
                title={reasonAction === 'reject' ? 'Reject PO' : reasonAction === 'return' ? 'Return PO' : 'Cancel PO'}
                width={480}
                footer={
                    <>
                        <Button size="sm" onClick={() => setReasonOpen(false)}>Close</Button>
                        <Button size="sm" variant="solid" loading={reasonSubmitting} onClick={submitReason}>
                            Confirm
                        </Button>
                    </>
                }
            >
                <FormItem label="Reason">
                    <Input
                        textArea
                        value={reasonText}
                        onChange={(e) => setReasonText(e.target.value)}
                        placeholder="Optional reason"
                    />
                </FormItem>
            </FormDialog>

            <FormDialog
                isOpen={headerEditOpen}
                onClose={() => setHeaderEditOpen(false)}
                title="Edit draft PO"
                description="Supplier and warehouse are optional. Add a supplier when you need vendor-specific follow-up (ASN/ER, invoicing)."
                width={520}
                footer={
                    <>
                        <Button size="sm" onClick={() => setHeaderEditOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={headerSaving} onClick={() => void saveHeaderEdit()}>
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem label="Supplier">
                        <Select
                            isClearable
                            isSearchable
                            placeholder="Select supplier"
                            options={supplierOpts}
                            value={supplierOpts.find((o) => o.value === headerDraft.supplierId) ?? null}
                            onChange={(opt: { value?: string } | null) =>
                                setHeaderDraft((p) => ({ ...p, supplierId: opt?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            isClearable
                            isSearchable
                            placeholder="Optional receiving warehouse"
                            options={warehouseOpts}
                            value={warehouseOpts.find((o) => o.value === headerDraft.warehouseId) ?? null}
                            onChange={(opt: { value?: string } | null) =>
                                setHeaderDraft((p) => ({ ...p, warehouseId: opt?.value ?? '' }))
                            }
                        />
                    </FormItem>
                    <FormItem label="Buyer">
                        <Input
                            value={headerDraft.buyerId}
                            onChange={(e) => setHeaderDraft((p) => ({ ...p, buyerId: e.target.value }))}
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <FormDialog
                isOpen={grOpen}
                onClose={() => setGrOpen(false)}
                title="Create Goods Receipt"
                description={`Receive against ${po.poNumber}`}
                width={640}
                icon={<HiOutlineInboxIn />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setGrOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={grSubmitting} onClick={handleCreateGr}>
                            Create & Post
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem
                        label="Receiving warehouse"
                        asterisk
                        invalid={Boolean(visibleError(grErrors, grTouched, 'warehouseId', grForce))}
                        errorMessage={visibleError(grErrors, grTouched, 'warehouseId', grForce)}
                    >
                        <Select
                            isSearchable
                            placeholder="Select warehouse for this receipt"
                            options={warehouseOpts}
                            value={warehouseOpts.find((o) => o.value === grWarehouseId) ?? null}
                            onChange={(opt: { value?: string } | null) => {
                                setGrWarehouseId(opt?.value ?? '')
                                setGrTouched((t) => ({ ...t, warehouseId: true }))
                            }}
                        />
                    </FormItem>
                    {!po.warehouseId ? (
                        <p className="text-xs text-gray-500">
                            This PO has no header warehouse — pick one here for posting, or set it under{' '}
                            <strong>Edit draft</strong> for future receipts.
                        </p>
                    ) : null}
                    {grRefsLoading ? (
                        <p className="text-sm text-gray-500">Loading batches / serials…</p>
                    ) : null}
                    {openQtyLines.map((l) => {
                        const err = visibleError(grErrors, grTouched, l.id, grForce)
                        const batchErr = visibleError(grErrors, grTouched, `batch-${l.id}`, grForce)
                        const serialErr = visibleError(grErrors, grTouched, `serial-${l.id}`, grForce)
                        const batchOpts = grBatchOpts[l.id] ?? []
                        const serialOpts = grSerialOpts[l.id] ?? []
                        const serialPicks = grSerialIds[l.id] ?? []
                        return (
                            <div key={l.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                <FormItem
                                    label={`${l.material?.materialCode ?? l.materialId} (open ${poOpenQty(l)})`}
                                    asterisk
                                    invalid={Boolean(err)}
                                    errorMessage={err}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        max={poOpenQty(l)}
                                        value={grLines[l.id] ?? ''}
                                        onChange={(e) => {
                                            const v = e.target.value
                                            setGrLines((p) => ({ ...p, [l.id]: v }))
                                            setGrTouched((t) => ({ ...t, [l.id]: true }))
                                            if (l.material?.serialManaged) {
                                                syncSerialSlots(l.id, Number(v) || 0)
                                            }
                                        }}
                                    />
                                </FormItem>
                                {l.material?.batchManaged && Number(grLines[l.id]) > 0 ? (
                                    <FormItem
                                        label="Batch"
                                        asterisk
                                        className="mt-2"
                                        invalid={Boolean(batchErr)}
                                        errorMessage={batchErr}
                                    >
                                        <Select
                                            isSearchable
                                            placeholder={batchOpts.length ? 'Select batch…' : 'No batches — create in Material Master → Batches'}
                                            options={batchOpts}
                                            value={batchOpts.find((o) => o.value === grBatchIds[l.id]) ?? null}
                                            onChange={(opt: { value: string } | null) => {
                                                setGrBatchIds((p) => ({ ...p, [l.id]: opt?.value ?? '' }))
                                                setGrTouched((t) => ({ ...t, [`batch-${l.id}`]: true }))
                                            }}
                                        />
                                    </FormItem>
                                ) : null}
                                {l.material?.serialManaged && serialPicks.length > 0 ? (
                                    <div className="mt-2 space-y-2">
                                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            Serial numbers (one per unit)
                                        </p>
                                        {serialErr ? (
                                            <p className="text-xs text-red-500">{serialErr}</p>
                                        ) : null}
                                        {serialPicks.map((pick, idx) => (
                                            <FormItem key={`${l.id}-sn-${idx}`} label={`Serial ${idx + 1}`} asterisk>
                                                <Select
                                                    isSearchable
                                                    placeholder={serialOpts.length ? 'Select serial…' : 'No serials — create in Material Master → Serial Numbers'}
                                                    options={serialOpts}
                                                    value={serialOpts.find((o) => o.value === pick) ?? null}
                                                    onChange={(opt: { value: string } | null) => {
                                                        setGrSerialIds((prev) => {
                                                            const next = [...(prev[l.id] ?? [])]
                                                            next[idx] = opt?.value ?? ''
                                                            return { ...prev, [l.id]: next }
                                                        })
                                                        setGrTouched((t) => ({ ...t, [`serial-${l.id}`]: true }))
                                                    }}
                                                />
                                            </FormItem>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={invOpen}
                onClose={() => setInvOpen(false)}
                title="Create Supplier Invoice"
                description={`Invoice against ${po.poNumber} — quantities must align to posted goods receipt lines.`}
                width={640}
                icon={<HiOutlineReceiptTax />}
                footer={
                    <>
                        <Button size="sm" onClick={() => setInvOpen(false)}>Cancel</Button>
                        <Button
                            size="sm"
                            variant="solid"
                            loading={invSubmitting}
                            onClick={() => void handleCreateSupplierInvoice()}
                        >
                            Create & Submit
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem label="Invoice date" asterisk>
                        <Input
                            type="date"
                            value={invDate}
                            onChange={(e) => setInvDate(e.target.value)}
                        />
                    </FormItem>
                    {!po.supplierId ? (
                        <FormItem
                            label="Supplier"
                            asterisk
                            invalid={Boolean(visibleError(invErrors, invTouched, 'supplierId', invForce))}
                            errorMessage={visibleError(invErrors, invTouched, 'supplierId', invForce)}
                        >
                            <Select
                                isSearchable
                                placeholder="Required for supplier invoice"
                                options={supplierOpts}
                                value={supplierOpts.find((o) => o.value === invSupplierId) ?? null}
                                onChange={(opt: { value?: string } | null) => {
                                    setInvSupplierId(opt?.value ?? '')
                                    setInvTouched((t) => ({ ...t, supplierId: true }))
                                }}
                            />
                        </FormItem>
                    ) : (
                        <InfoCard
                            label="Supplier"
                            value={
                                po.supplier
                                    ? `${po.supplier.supplierCode} — ${po.supplier.supplierName}`
                                    : po.supplierId
                            }
                        />
                    )}
                    <FormItem label="Remarks">
                        <Input
                            textArea
                            value={invRemarks}
                            onChange={(e) => setInvRemarks(e.target.value)}
                            placeholder="Optional vendor invoice reference"
                        />
                    </FormItem>
                    {invRefsLoading ? (
                        <p className="text-sm text-gray-500">Loading posted goods receipts…</p>
                    ) : null}
                    {invOpenQtyLines.map((l) => {
                        const err = visibleError(invErrors, invTouched, l.id, invForce)
                        const grErr = visibleError(invErrors, invTouched, `gr-${l.id}`, invForce)
                        const grOpts = (invGrOpts[l.id] ?? []).map((o) => ({
                            value: o.value,
                            label: o.label,
                        }))
                        return (
                            <div key={l.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                <FormItem
                                    label={`${l.material?.materialCode ?? l.materialId} (open to invoice ${poInvoiceOpenQty(l)})`}
                                    asterisk
                                    invalid={Boolean(err)}
                                    errorMessage={err}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        max={poInvoiceOpenQty(l)}
                                        value={invLines[l.id] ?? ''}
                                        onChange={(e) => {
                                            setInvLines((p) => ({ ...p, [l.id]: e.target.value }))
                                            setInvTouched((t) => ({ ...t, [l.id]: true }))
                                        }}
                                    />
                                </FormItem>
                                {Number(invLines[l.id]) > 0 ? (
                                    <FormItem
                                        label="Goods receipt line"
                                        asterisk
                                        className="mt-2"
                                        invalid={Boolean(grErr)}
                                        errorMessage={grErr}
                                    >
                                        <Select
                                            isSearchable
                                            placeholder={grOpts.length ? 'Select posted GR line…' : 'No posted GR lines for this PO line'}
                                            options={grOpts}
                                            value={grOpts.find((o) => o.value === invGrLineId[l.id]) ?? null}
                                            onChange={(opt: { value?: string } | null) => {
                                                setInvGrLineId((p) => ({ ...p, [l.id]: opt?.value ?? '' }))
                                                setInvTouched((t) => ({ ...t, [`gr-${l.id}`]: true }))
                                            }}
                                        />
                                    </FormItem>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            </FormDialog>

            <FormDialog
                isOpen={attachOpen}
                onClose={() => setAttachOpen(false)}
                title="Add Attachment"
                width={480}
                footer={
                    <>
                        <Button size="sm" onClick={() => setAttachOpen(false)}>Cancel</Button>
                        <Button size="sm" variant="solid" loading={attachSubmitting} onClick={handleAttach}>
                            Save
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <FormItem
                        label="File name"
                        asterisk
                        invalid={Boolean(visibleError(attachErrors, attachTouched, 'fileName', attachForce))}
                        errorMessage={visibleError(attachErrors, attachTouched, 'fileName', attachForce)}
                    >
                        <Input
                            value={attachForm.fileName}
                            onChange={(e) => {
                                setAttachForm((p) => ({ ...p, fileName: e.target.value }))
                                setAttachTouched((t) => ({ ...t, fileName: true }))
                            }}
                        />
                    </FormItem>
                    <FormItem label="File URL">
                        <Input
                            value={attachForm.fileUrl}
                            onChange={(e) => setAttachForm((p) => ({ ...p, fileUrl: e.target.value }))}
                            placeholder="https://..."
                        />
                    </FormItem>
                </div>
            </FormDialog>

            <SupplierInvoicePrintHost
                slip={invPrintSlip}
                onClose={() => setInvPrintSlip(null)}
            />
        </PageContainer>
    )
}

const InfoCard = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-600">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium">{value || '—'}</p>
    </div>
)

export default PurchaseOrderDetailPage
