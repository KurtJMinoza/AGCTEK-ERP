'use client'

import { useMemo, useState } from 'react'
import FormDialog from '@/components/shared/FormDialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { adjustmentService } from '../../inventory/services/adjustmentService'
import { useReferenceData } from '../hooks/useReferenceData'
import type { Material } from '../types'

const REASON_OPTIONS = [
    { value: 'FOUND', label: 'Found / Overage' },
    { value: 'OVERAGE', label: 'Overage' },
    { value: 'COUNT_VARIANCE', label: 'Count Variance' },
    { value: 'SYSTEM_ERROR', label: 'System Error' },
    { value: 'LOSS', label: 'Loss' },
    { value: 'SHRINKAGE', label: 'Shrinkage' },
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'EXPIRED', label: 'Expired' },
]

type AdjustStockDialogProps = {
    material: Material
    isOpen: boolean
    onClose: () => void
    /** Called after the adjustment is created (DRAFT→submit→POSTED or PENDING_APPROVAL). */
    onPosted: () => void
}

/**
 * Manual stock change for one material. The Material Master treats on-hand as
 * ledger-owned (read-only) — this dialog posts a real Inventory Adjustment
 * through the MM adjustment engine (InventoryPostingService) so the
 * MmInventoryTransaction / balance rows, Product Catalog availability and the
 * ledger display all stay consistent.
 */
const AdjustStockDialog = ({
    material,
    isOpen,
    onClose,
    onPosted,
}: AdjustStockDialogProps) => {
    const { warehouses } = useReferenceData(['warehouses'])
    const [warehouseId, setWarehouseId] = useState<string>(
        material.defaultWarehouseId ?? '',
    )
    const [quantity, setQuantity] = useState<string>('')
    const [quantityError, setQuantityError] = useState<string | null>(null)
    const [reason, setReason] = useState<string>('FOUND')
    const [justification, setJustification] = useState('')
    const [postingDate, setPostingDate] = useState(
        new Date().toISOString().slice(0, 10),
    )
    const [batchId, setBatchId] = useState<string>('')
    const [serialNumberId, setSerialNumberId] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)

    const companyWarehouses = useMemo(
        () =>
            warehouses.filter(
                (w) => !material.companyId || w.companyId === material.companyId,
            ),
        [warehouses, material.companyId],
    )

    const warehouseOptions = useMemo(
        () =>
            companyWarehouses.map((w) => ({
                value: w.id,
                label: `${w.code} — ${w.name}`,
            })),
        [companyWarehouses],
    )

    const batchOptions = useMemo(
        () =>
            (material.batches ?? []).map((b) => ({
                value: b.id,
                label: b.batchNumber,
            })),
        [material.batches],
    )

    const serialOptions = useMemo(
        () =>
            (material.serialNumbers ?? []).map((s) => ({
                value: s.id,
                label: s.serialNumber,
            })),
        [material.serialNumbers],
    )

    const reset = () => {
        setQuantity('')
        setQuantityError(null)
        setReason('FOUND')
        setJustification('')
        setBatchId('')
        setSerialNumberId('')
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleSubmit = async () => {
        const qty = Number(quantity)
        if (!Number.isFinite(qty) || qty === 0) {
            setQuantityError(
                'Enter a non-zero quantity. Positive adds stock, negative removes it.',
            )
            return
        }
        if (!warehouseId) {
            toast.push(
                <Notification type="danger" title="Warehouse required">
                    Select the warehouse this adjustment posts to.
                </Notification>,
                { placement: 'top-end' },
            )
            return
        }
        if (material.batchManaged && !batchId) {
            toast.push(
                <Notification type="danger" title="Batch required">
                    This material is batch-managed — select the batch to adjust.
                </Notification>,
                { placement: 'top-end' },
            )
            return
        }
        if (material.serialManaged && !serialNumberId) {
            toast.push(
                <Notification type="danger" title="Serial required">
                    This material is serial-managed — select the serial number to
                    adjust.
                </Notification>,
                { placement: 'top-end' },
            )
            return
        }

        setSubmitting(true)
        try {
            const doc = await adjustmentService.create({
                companyId: material.companyId,
                warehouseId,
                postingDate,
                adjustmentReason: reason,
                justification: justification.trim() || undefined,
                lines: [
                    {
                        materialId: material.id,
                        quantity: qty,
                        uomId: material.baseUomId,
                        batchId: batchId || undefined,
                        serialNumberId: serialNumberId || undefined,
                        unitCost: Number(material.standardCost ?? 0),
                        remarks: justification.trim() || undefined,
                    },
                ],
            })
            const submitted = await adjustmentService.submit(doc.id)
            const status = submitted.status ?? 'POSTED'
            if (status === 'POSTED') {
                toast.push(
                    <Notification type="success" title="Stock adjusted">
                        {qty > 0 ? '+' : ''}
                        {qty} {material.baseUom?.code ?? 'units'} posted as a{' '}
                        {reason} adjustment. Ledger, availability and Product
                        Catalog are updated.
                    </Notification>,
                    { placement: 'top-end' },
                )
            } else {
                toast.push(
                    <Notification type="warning" title="Adjustment awaits approval">
                        The adjustment value requires approval — go to Inventory →
                        Inventory Adjustments to approve it before it is posted.
                    </Notification>,
                    { placement: 'top-end' },
                )
            }
            reset()
            onClose()
            onPosted()
        } catch (err) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response
                    ?.data?.message ?? (err as Error)?.message ?? 'Adjustment failed'
            toast.push(
                <Notification type="danger" title="Adjustment failed">
                    {message}
                </Notification>,
                { placement: 'top-end' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={handleClose}
            onRequestClose={handleClose}
            title="Adjust stock"
            description={`Post a manual stock adjustment for ${material.materialCode} — ${material.materialName ?? material.description ?? ''}. This writes an Inventory Adjustment through the MM ledger (only posted transactions affect on-hand).`}
            footerContent={
                <div className="flex w-full gap-2">
                    <Button
                        block
                        variant="plain"
                        onClick={handleClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        block
                        variant="solid"
                        loading={submitting}
                        onClick={handleSubmit}
                    >
                        Submit adjustment
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem label="Quantity (+ adds / − removes)">
                        <Input
                            type="number"
                            step="any"
                            placeholder="e.g. 10 or -3"
                            value={quantity}
                            invalid={Boolean(quantityError)}
                            onChange={(e) => {
                                setQuantity(e.target.value)
                                setQuantityError(null)
                            }}
                        />
                        {quantityError ? (
                            <p className="mt-1 text-xs text-red-500">
                                {quantityError}
                            </p>
                        ) : null}
                    </FormItem>
                    <FormItem label="Warehouse">
                        <Select
                            options={warehouseOptions}
                            value={warehouseOptions.find(
                                (o) => o.value === warehouseId,
                            )}
                            onChange={(opt) =>
                                setWarehouseId((opt as { value?: string })?.value ?? '')
                            }
                        />
                    </FormItem>
                    <FormItem label="Reason">
                        <Select
                            options={REASON_OPTIONS}
                            value={REASON_OPTIONS.find((o) => o.value === reason)}
                            onChange={(opt) =>
                                setReason((opt as { value?: string })?.value ?? 'FOUND')
                            }
                        />
                    </FormItem>
                    <FormItem label="Posting date">
                        <Input
                            type="date"
                            value={postingDate}
                            onChange={(e) => setPostingDate(e.target.value)}
                        />
                    </FormItem>
                    {material.batchManaged ? (
                        <FormItem label="Batch">
                            <Select
                                options={batchOptions}
                                value={batchOptions.find((o) => o.value === batchId)}
                                onChange={(opt) =>
                                    setBatchId(
                                        (opt as { value?: string })?.value ?? '',
                                    )
                                }
                            />
                        </FormItem>
                    ) : null}
                    {material.serialManaged ? (
                        <FormItem label="Serial number">
                            <Select
                                options={serialOptions}
                                value={serialOptions.find(
                                    (o) => o.value === serialNumberId,
                                )}
                                onChange={(opt) =>
                                    setSerialNumberId(
                                        (opt as { value?: string })?.value ?? '',
                                    )
                                }
                            />
                        </FormItem>
                    ) : null}
                </div>
                <FormItem label="Justification / remarks (optional)">
                    <Input
                        placeholder="Why is this stock being adjusted?"
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                    />
                </FormItem>
                <p className="text-xs text-gray-500">
                    Current ledger
                    {material.ledgerOnHandQty !== undefined
                        ? ` — on hand ${material.ledgerOnHandQty}, reserved ${material.ledgerReservedQty ?? 0}, available ${material.ledgerAvailableQty ?? 0}.`
                        : ''}{' '}
                    On hand changes only when this adjustment is POSTED, never via
                    the master form.
                </p>
            </div>
        </FormDialog>
    )
}

export default AdjustStockDialog