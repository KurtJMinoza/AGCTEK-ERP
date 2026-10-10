'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { updateQuotationDraft, type Quotation } from '@/modules/sd/services/quotationService'
import { apiCreateOpportunityQuotation } from '../../services/crmApi'
import ProductLinesEditor, {
    chosenProductLines,
    emptyProductLine,
    productLinesFrom,
    productLinesValid,
    toProductLineInputs,
    useSdCatalog,
    type ProductLineForm,
} from '../ProductLinesEditor'
import type { Opportunity } from '../../types'

type QuotationComposeFormProps = {
    opportunity: Opportunity
    /** Non-null when editing an existing DRAFT. */
    initialQuotation?: Quotation
    onSaved: (quotation: Quotation) => void
    /** Called when `dirty` changes so the page can install navigation guards. */
    onDirtyChange?: (dirty: boolean) => void
}

function linesEqual(a: ProductLineForm[], b: ProductLineForm[]) {
    if (a.length !== b.length) return false
    return a.every((line, i) => {
        const other = b[i]
        return (
            line.productId === other.productId &&
            line.quantity === other.quantity &&
            line.sku === other.sku
        )
    })
}

/** Compose / edit a DRAFT on the quotation page. SD prices every line from its catalog on each save. */
export default function QuotationComposeForm({
    opportunity,
    initialQuotation,
    onSaved,
    onDirtyChange,
}: QuotationComposeFormProps) {
    const editing = initialQuotation
    const [lines, setLines] = useState<ProductLineForm[]>(() =>
        editing ? productLinesFrom(editing.lines) : [emptyProductLine()],
    )
    const [notes, setNotes] = useState(editing?.notes ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const catalog = useSdCatalog(true)

    useEffect(() => {
        setLines(editing ? productLinesFrom(editing.lines) : [emptyProductLine()])
        setNotes(editing?.notes ?? '')
        setError(null)
    }, [editing])

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
    const dirty =
        !linesEqual(lines, editing ? productLinesFrom(editing.lines) : [emptyProductLine()]) ||
        notes !== (editing?.notes ?? '')

    useEffect(() => {
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    const save = async () => {
        if (!valid) return
        setSaving(true)
        setError(null)
        try {
            const body = { lines: toProductLineInputs(lines), notes: notes.trim() }
            onSaved(
                editing
                    ? await updateQuotationDraft(editing.id, body)
                    : await apiCreateOpportunityQuotation(opportunity.id, {
                          lines: body.lines,
                          notes: body.notes || undefined,
                      }),
            )
        } catch (err) {
            setError(getApiErrorMessage(err, 'Could not save the quotation'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <AdaptiveCard>
            {error || catalog.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error ?? catalog.error}
                </Alert>
            ) : null}
            <h6 className="mb-2">Lines (SD products)</h6>
            {chosenProductLines(lines).length === 0 ? (
                <p className="mb-2 text-xs text-gray-500">
                    Add a product line to draft the quotation.
                </p>
            ) : null}
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
            <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="solid" disabled={!valid} loading={saving} onClick={() => void save()}>
                    {editing ? 'Save draft' : 'Create draft'}
                </Button>
            </div>
        </AdaptiveCard>
    )
}