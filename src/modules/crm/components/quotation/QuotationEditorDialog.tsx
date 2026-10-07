'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import { updateQuotationDraft } from '@/modules/sd/services/quotationService'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import ProductLinesEditor, {
    emptyProductLine,
    productLinesFrom,
    productLinesValid,
    toProductLineInputs,
    useSdCatalog,
    type ProductLineForm,
} from '../ProductLinesEditor'
import { apiCreateOpportunityQuotation } from '../../services/crmApi'
import { quotationLabel } from './QuotationSummary'
import type { Opportunity, Quotation } from '../../types'

export type QuotationEditorTarget = { mode: 'create' } | { mode: 'edit'; quotation: Quotation }

type QuotationEditorDialogProps = {
    opportunity: Opportunity
    target: QuotationEditorTarget | null
    onClose: () => void
    onSaved: (quotation: Quotation) => void
}

/** New quotation or DRAFT edit. SD prices every line from its catalog on each save. */
export default function QuotationEditorDialog({ opportunity, target, onClose, onSaved }: QuotationEditorDialogProps) {
    const editing = target?.mode === 'edit' ? target.quotation : null
    const [lines, setLines] = useState<ProductLineForm[]>(() => [emptyProductLine()])
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const catalog = useSdCatalog(Boolean(target))

    useEffect(() => {
        setLines(editing ? productLinesFrom(editing.lines) : [emptyProductLine()])
        setNotes(editing?.notes ?? '')
        setError(null)
    }, [target, editing])

    const highlights = useMemo(() => {
        if (!editing) return undefined
        const productOf = new Map(editing.lines.map((l) => [l.lineNumber, l.productId]))
        return Object.fromEntries(
            editing.lineIssues.map((issue) => [
                productOf.get(issue.lineNumber) ?? '',
                issue.reason === 'INACTIVE'
                    ? `${issue.sku} is inactive in the SD catalog; remove or replace this line`
                    : `${issue.sku} no longer exists in the SD catalog; remove or replace this line`,
            ]),
        )
    }, [editing])

    const valid = productLinesValid(lines)

    const save = async () => {
        if (!target || !valid) return
        setSaving(true)
        setError(null)
        try {
            const body = { lines: toProductLineInputs(lines), notes: notes.trim() }
            onSaved(
                editing
                    ? await updateQuotationDraft(editing.id, body)
                    : await apiCreateOpportunityQuotation(opportunity.id, { ...body, notes: body.notes || undefined }),
            )
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not save the quotation'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(target)}
            onClose={onClose}
            size="lg"
            title={editing ? `Edit ${quotationLabel(editing)}` : `New quotation · ${opportunity.name}`}
            description={`For ${opportunity.customer.companyName}. SD prices each line from its catalog when saved; prices are frozen when the quotation is sent.`}
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" variant="solid" disabled={!valid} loading={saving} onClick={() => void save()}>
                        {editing ? 'Save draft' : 'Create draft'}
                    </Button>
                </>
            }
        >
            {error || catalog.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error ?? catalog.error}
                </Alert>
            ) : null}
            <h6 className="mb-2">Lines (SD products)</h6>
            <ProductLinesEditor
                products={catalog.products}
                loading={catalog.loading}
                lines={lines}
                onChange={setLines}
                highlights={highlights}
                estimateNote="SD sets the quoted prices and totals."
            />
            <FormItem label="Notes" className="mt-4">
                <Input textArea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormItem>
        </FormDialog>
    )
}
