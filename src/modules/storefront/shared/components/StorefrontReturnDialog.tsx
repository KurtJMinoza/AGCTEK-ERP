'use client'

import { useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import { Form, FormItem } from '@/components/ui/Form'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import {
    createCustomerReturnRequest,
    uploadReturnPhoto,
    type CustomerReturnLinePayload,
    type SalesOrderRecord,
} from '@/modules/sd/services/salesOrderDashboardService'

const RETURN_REASONS = [
    { value: 'CHANGED_MIND', label: 'Changed my mind' },
    { value: 'WRONG_ITEM', label: 'Wrong item received' },
    { value: 'DEFECTIVE_ITEM', label: 'Defective item' },
    { value: 'DAMAGED_ITEM', label: 'Damaged item' },
    { value: 'OTHER', label: 'Other' },
] as const

type ReturnReason = (typeof RETURN_REASONS)[number]['value']

type ReturnReasonOption = { value: ReturnReason; label: string }

type StorefrontReturnDialogProps = {
    isOpen: boolean
    onClose: () => void
    order: SalesOrderRecord
    token: string
    onSubmitted: (requestNumber: string) => void
    onError: (message: string) => void
}

const StorefrontReturnDialog = ({
    isOpen,
    onClose,
    order,
    token,
    onSubmitted,
    onError,
}: StorefrontReturnDialogProps) => {
    const [selected, setSelected] = useState<Record<string, number>>({})
    const [reason, setReason] = useState<ReturnReason>('CHANGED_MIND')
    const [conditionNote, setConditionNote] = useState('')
    const [photos, setPhotos] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setSelected({})
        setReason('CHANGED_MIND')
        setConditionNote('')
        setPhotos([])
        setFormError(null)
    }

    const close = () => {
        reset()
        onClose()
    }

    const eligibleLines = order.lines.filter(
        (line) => line.lineId && line.quantity > 0,
    )

    const toggleLine = (lineId: string, quantity: number) => {
        setSelected((prev) => {
            const next = { ...prev }
            if (next[lineId]) delete next[lineId]
            else next[lineId] = quantity
            return next
        })
    }

    const changeQuantity = (lineId: string, max: number, quantity: number) => {
        setSelected((prev) => ({
            ...prev,
            [lineId]: Math.min(Math.max(1, quantity), max),
        }))
    }

    const handlePhoto = async (file: File | undefined) => {
        if (!file) return
        setUploading(true)
        setFormError(null)
        try {
            const url = await uploadReturnPhoto(file)
            setPhotos((prev) => [...prev, url])
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Unable to upload photo',
            )
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const submit = async () => {
        const lines: CustomerReturnLinePayload[] = Object.entries(selected)
            .filter(([, quantity]) => quantity > 0)
            .map(([salesOrderLineId, quantity]) => ({
                salesOrderLineId,
                quantity,
                reason,
                conditionNote: conditionNote.trim() || undefined,
            }))
        if (lines.length === 0) {
            setFormError('Choose at least one item to return.')
            return
        }
        setSubmitting(true)
        setFormError(null)
        try {
            const request = await createCustomerReturnRequest(
                order.id,
                {
                    reason,
                    conditionNote: conditionNote.trim() || undefined,
                    photos: photos.length ? photos : undefined,
                    lines,
                },
                token,
            )
            reset()
            onSubmitted(request.requestNumber)
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Unable to submit return',
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={560}
            onClose={close}
            onRequestClose={close}
        >
            <div className="p-6">
                <h2 className="mb-1 text-lg font-semibold heading-text">
                    Return items
                </h2>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                    {order.orderId} — tell us what you are returning and why.
                </p>

                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}

                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submit()
                    }}
                >
                    <FormItem label="Items to return">
                        <div className="flex flex-col gap-2">
                            {eligibleLines.map((line) => (
                                <label
                                    key={line.lineId}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Checkbox
                                            checked={Boolean(
                                                selected[line.lineId],
                                            )}
                                            onChange={() =>
                                                toggleLine(
                                                    line.lineId,
                                                    line.quantity,
                                                )
                                            }
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">
                                                {line.name}
                                            </span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                Ordered {line.quantity} ×{' '}
                                                {line.sku}
                                            </span>
                                        </span>
                                    </span>
                                    {selected[line.lineId] ? (
                                        <input
                                            type="number"
                                            min={1}
                                            max={line.quantity}
                                            value={selected[line.lineId]}
                                            onChange={(e) =>
                                                changeQuantity(
                                                    line.lineId,
                                                    line.quantity,
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                                        />
                                    ) : null}
                                </label>
                            ))}
                        </div>
                    </FormItem>

                    <FormItem label="Reason">
                        <Select<ReturnReasonOption>
                            options={RETURN_REASONS as readonly ReturnReasonOption[]}
                            value={RETURN_REASONS.find(
                                (option) => option.value === reason,
                            ) as ReturnReasonOption | undefined}
                            onChange={(option) =>
                                setReason(option?.value ?? 'CHANGED_MIND')
                            }
                        />
                    </FormItem>

                    <FormItem label="Condition note (optional)">
                        <textarea
                            value={conditionNote}
                            onChange={(e) => setConditionNote(e.target.value)}
                            rows={3}
                            placeholder="Describe the condition of the items…"
                            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                        />
                    </FormItem>

                    <FormItem label="Photos (optional)">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            disabled={uploading}
                            onChange={(e) =>
                                void handlePhoto(e.target.files?.[0])
                            }
                            className="w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 dark:text-gray-300 dark:file:bg-gray-800 dark:file:text-gray-200"
                        />
                        {photos.length ? (
                            <ul className="mt-2 flex flex-wrap gap-2">
                                {photos.map((url) => (
                                    <li key={url}>
                                        <img
                                            src={url}
                                            alt="Return evidence"
                                            className="h-16 w-16 rounded-md object-cover"
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </FormItem>

                    <div className="mt-5 flex justify-end gap-2">
                        <Button variant="plain" onClick={close}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="solid"
                            disabled={submitting || uploading}
                        >
                            {submitting ? (
                                <Spinner size={16} className="mr-2" />
                            ) : null}
                            Submit return request
                        </Button>
                    </div>
                </Form>
            </div>
        </Dialog>
    )
}

export default StorefrontReturnDialog