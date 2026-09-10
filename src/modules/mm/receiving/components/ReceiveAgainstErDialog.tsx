'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineInboxIn } from 'react-icons/hi'
import { inboundService } from '../services/inboundService'
import type { MmExpectedReceipt, MmExpectedReceiptLine } from '../types'
import type { GoodsReceipt } from '@/modules/mm/inventory/types'
import {
    firstError,
    nonNegativeNumber,
    required,
    visibleError,
    type FieldErrors,
} from '@/modules/mm/shared/formValidation'

type LineDraft = {
    expectedReceiptLineId: string
    receivedQuantity: string
    damagedQuantity: string
    rejectedQuantity: string
    barcode: string
    batchId: string
    serialNumberId: string
    unitCost: string
}

function pushToast(type: 'success' | 'danger', title: string, msg: string) {
    toast.push(
        <Notification type={type} title={title} closable duration={3500}>
            {msg}
        </Notification>,
        { placement: 'top-end' },
    )
}

function remainingQty(line: MmExpectedReceiptLine) {
    return Math.max(0, Number(line.expectedQuantity) - Number(line.receivedQuantity))
}

function buildDrafts(lines: MmExpectedReceiptLine[]): LineDraft[] {
    return lines
        .filter((l) => remainingQty(l) > 0 || l.status === 'OPEN' || l.status === 'PARTIAL')
        .map((l) => ({
            expectedReceiptLineId: l.id,
            receivedQuantity: String(remainingQty(l) || 0),
            damagedQuantity: '0',
            rejectedQuantity: '0',
            barcode: '',
            batchId: '',
            serialNumberId: '',
            unitCost: '',
        }))
}

export type ReceiveAgainstErDialogProps = {
    isOpen: boolean
    expectedReceipt: MmExpectedReceipt | null
    onClose: () => void
    onSuccess?: (gr: GoodsReceipt) => void
}

const ReceiveAgainstErDialog = ({
    isOpen,
    expectedReceipt,
    onClose,
    onSuccess,
}: ReceiveAgainstErDialogProps) => {
    const [drafts, setDrafts] = useState<LineDraft[]>([])
    const [submitting, setSubmitting] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})
    const [forceValidate, setForceValidate] = useState(false)

    useEffect(() => {
        if (isOpen && expectedReceipt) {
            setDrafts(buildDrafts(expectedReceipt.lines ?? []))
            setTouched({})
            setForceValidate(false)
        }
    }, [isOpen, expectedReceipt])

    const lineById = useMemo(() => {
        const map = new Map<string, MmExpectedReceiptLine>()
        for (const l of expectedReceipt?.lines ?? []) map.set(l.id, l)
        return map
    }, [expectedReceipt])

    const errors = useMemo<FieldErrors>(() => {
        const e: FieldErrors = {}
        if (!drafts.length) {
            e.lines = 'No open lines to receive'
            return e
        }
        let anyQty = false
        drafts.forEach((d, idx) => {
            const line = lineById.get(d.expectedReceiptLineId)
            const qtyErr = firstError(
                nonNegativeNumber(d.receivedQuantity, 'Received qty'),
                Number(d.receivedQuantity) > 0 ? undefined : undefined,
            )
            const dmgErr = nonNegativeNumber(d.damagedQuantity, 'Damaged qty')
            const rejErr = nonNegativeNumber(d.rejectedQuantity, 'Rejected qty')
            if (qtyErr) e[`qty-${idx}`] = qtyErr
            if (dmgErr) e[`dmg-${idx}`] = dmgErr
            if (rejErr) e[`rej-${idx}`] = rejErr
            if (Number(d.receivedQuantity) > 0) anyQty = true
            if (line?.material?.batchManaged) {
                const b = required(d.batchId, 'Batch')
                if (b && Number(d.receivedQuantity) > 0) e[`batch-${idx}`] = b
            }
            if (line?.material?.serialManaged) {
                const s = required(d.serialNumberId, 'Serial')
                if (s && Number(d.receivedQuantity) > 0) e[`serial-${idx}`] = s
            }
            const dmg = Number(d.damagedQuantity) || 0
            const rej = Number(d.rejectedQuantity) || 0
            const recv = Number(d.receivedQuantity) || 0
            if (dmg + rej > recv && d.receivedQuantity !== '') {
                e[`dmg-${idx}`] = 'Damaged + rejected cannot exceed received'
            }
        })
        if (!anyQty) e.lines = 'Enter a received quantity on at least one line'
        return e
    }, [drafts, lineById])

    const updateDraft = useCallback((idx: number, patch: Partial<LineDraft>) => {
        setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
    }, [])

    const handleSubmit = useCallback(async () => {
        if (!expectedReceipt) return
        setForceValidate(true)
        if (Object.values(errors).some(Boolean)) {
            pushToast('danger', 'Validation', 'Fix line errors before receiving.')
            return
        }
        setSubmitting(true)
        try {
            const lines = drafts
                .filter((d) => Number(d.receivedQuantity) > 0)
                .map((d) => ({
                    expectedReceiptLineId: d.expectedReceiptLineId,
                    receivedQuantity: Number(d.receivedQuantity),
                    damagedQuantity: Number(d.damagedQuantity) || 0,
                    rejectedQuantity: Number(d.rejectedQuantity) || 0,
                    barcode: d.barcode.trim() || undefined,
                    batchId: d.batchId.trim() || undefined,
                    serialNumberId: d.serialNumberId.trim() || undefined,
                    unitCost: d.unitCost !== '' ? Number(d.unitCost) : undefined,
                }))
            const gr = await inboundService.receive({
                expectedReceiptId: expectedReceipt.id,
                lines,
            })
            pushToast(
                'success',
                'Received',
                `Draft goods receipt ${gr.documentNumber} created.`,
            )
            onSuccess?.(gr)
            onClose()
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string | string[] } } })?.response
                    ?.data?.message || 'Receive failed'
            pushToast('danger', 'Error', Array.isArray(msg) ? msg.join(', ') : msg)
        } finally {
            setSubmitting(false)
        }
    }, [expectedReceipt, drafts, errors, onClose, onSuccess])

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
            title="Receive against expected receipt"
            description={
                expectedReceipt
                    ? `${expectedReceipt.documentNumber} · ${expectedReceipt.supplier?.supplierName ?? ''}`
                    : undefined
            }
            icon={<HiOutlineInboxIn />}
            footer={
                <>
                    <Button size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={submitting}
                        onClick={handleSubmit}
                        disabled={!drafts.length}
                    >
                        Create draft GR
                    </Button>
                </>
            }
        >
            {visibleError(errors, touched, 'lines', forceValidate) ? (
                <p className="mb-3 text-sm text-red-500">
                    {visibleError(errors, touched, 'lines', forceValidate)}
                </p>
            ) : null}

            <div className="space-y-4">
                {drafts.map((d, idx) => {
                    const line = lineById.get(d.expectedReceiptLineId)
                    if (!line) return null
                    const rem = remainingQty(line)
                    return (
                        <div
                            key={d.expectedReceiptLineId}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                                <span className="font-medium">
                                    {line.material?.materialCode} — {line.material?.materialName}
                                </span>
                                <span className="text-gray-500">
                                    Remaining {rem} {line.uom?.code ?? ''}
                                    {' · '}Expected {Number(line.expectedQuantity)}
                                    {' · '}Received {Number(line.receivedQuantity)}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                <FormItem
                                    label="Received qty"
                                    invalid={!!visibleError(errors, touched, `qty-${idx}`, forceValidate)}
                                    errorMessage={visibleError(errors, touched, `qty-${idx}`, forceValidate)}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.receivedQuantity}
                                        onChange={(e) => {
                                            setTouched((t) => ({ ...t, [`qty-${idx}`]: true }))
                                            updateDraft(idx, { receivedQuantity: e.target.value })
                                        }}
                                    />
                                </FormItem>
                                <FormItem
                                    label="Damaged"
                                    invalid={!!visibleError(errors, touched, `dmg-${idx}`, forceValidate)}
                                    errorMessage={visibleError(errors, touched, `dmg-${idx}`, forceValidate)}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.damagedQuantity}
                                        onChange={(e) => {
                                            setTouched((t) => ({ ...t, [`dmg-${idx}`]: true }))
                                            updateDraft(idx, { damagedQuantity: e.target.value })
                                        }}
                                    />
                                </FormItem>
                                <FormItem
                                    label="Rejected"
                                    invalid={!!visibleError(errors, touched, `rej-${idx}`, forceValidate)}
                                    errorMessage={visibleError(errors, touched, `rej-${idx}`, forceValidate)}
                                >
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.rejectedQuantity}
                                        onChange={(e) => {
                                            setTouched((t) => ({ ...t, [`rej-${idx}`]: true }))
                                            updateDraft(idx, { rejectedQuantity: e.target.value })
                                        }}
                                    />
                                </FormItem>
                                <FormItem label="Barcode" className="sm:col-span-1 lg:col-span-2">
                                    <Input
                                        value={d.barcode}
                                        placeholder="Optional scan"
                                        onChange={(e) => updateDraft(idx, { barcode: e.target.value })}
                                    />
                                </FormItem>
                                {line.material?.batchManaged ? (
                                    <FormItem
                                        label="Batch ID"
                                        invalid={!!visibleError(errors, touched, `batch-${idx}`, forceValidate)}
                                        errorMessage={visibleError(errors, touched, `batch-${idx}`, forceValidate)}
                                    >
                                        <Input
                                            value={d.batchId}
                                            onChange={(e) => {
                                                setTouched((t) => ({ ...t, [`batch-${idx}`]: true }))
                                                updateDraft(idx, { batchId: e.target.value })
                                            }}
                                        />
                                    </FormItem>
                                ) : null}
                                {line.material?.serialManaged ? (
                                    <FormItem
                                        label="Serial ID"
                                        invalid={!!visibleError(errors, touched, `serial-${idx}`, forceValidate)}
                                        errorMessage={visibleError(errors, touched, `serial-${idx}`, forceValidate)}
                                    >
                                        <Input
                                            value={d.serialNumberId}
                                            onChange={(e) => {
                                                setTouched((t) => ({ ...t, [`serial-${idx}`]: true }))
                                                updateDraft(idx, { serialNumberId: e.target.value })
                                            }}
                                        />
                                    </FormItem>
                                ) : null}
                                <FormItem label="Unit cost">
                                    <Input
                                        type="number"
                                        min={0}
                                        value={d.unitCost}
                                        onChange={(e) => updateDraft(idx, { unitCost: e.target.value })}
                                    />
                                </FormItem>
                            </div>
                        </div>
                    )
                })}
                {!drafts.length ? (
                    <p className="text-sm text-gray-500">No open lines remaining on this expected receipt.</p>
                ) : null}
            </div>
        </FormDialog>
    )
}

export default ReceiveAgainstErDialog
