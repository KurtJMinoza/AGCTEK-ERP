'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { updateQuotationDraft, type Quotation } from '@/modules/sd/services/quotationService'
import { apiCreateOpportunityQuotation } from '../../services/crmApi'
import { useQuotationStock } from '../../hooks/useQuotationStock'
import { useSdCatalog } from '../ProductLinesEditor'
import QuotationItemsEditor, {
    itemsFromQuotation,
    itemsProblem,
    itemsToInput,
    type QuoteItem,
} from './QuotationItemsEditor'
import type { Opportunity } from '../../types'

type QuotationComposeFormProps = {
    opportunity: Opportunity
    /** Non-null when editing an existing DRAFT. */
    initialQuotation?: Quotation
    onSaved: (quotation: Quotation) => void
    /** Called when `dirty` changes so the page can install navigation guards. */
    onDirtyChange?: (dirty: boolean) => void
}

/** Comparable snapshot of the rows (keys excluded; blank product rows count). */
const snapshot = (items: QuoteItem[]) =>
    JSON.stringify(
        items.map((item) =>
            item.kind === 'SECTION' ? ['S', item.title] : ['L', item.productId, item.quantity, item.sku ?? null],
        ),
    )

/**
 * Compose / edit a DRAFT on the quotation page: product lines grouped under optional free-text
 * section headings. SD prices every line from its catalog on each save; stock chips are indicative.
 */
export default function QuotationComposeForm({
    opportunity,
    initialQuotation,
    onSaved,
    onDirtyChange,
}: QuotationComposeFormProps) {
    const editing = initialQuotation
    const [items, setItems] = useState<QuoteItem[]>(() => itemsFromQuotation(editing))
    const [notes, setNotes] = useState(editing?.notes ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const catalog = useSdCatalog(true)

    useEffect(() => {
        setItems(itemsFromQuotation(editing))
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

    const input = useMemo(() => itemsToInput(items), [items])
    const stock = useQuotationStock(input.lines)
    const problem = itemsProblem(items)
    const initialSnapshot = useMemo(() => snapshot(itemsFromQuotation(editing)), [editing])
    const dirty = snapshot(items) !== initialSnapshot || notes !== (editing?.notes ?? '')

    useEffect(() => {
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    const save = async () => {
        if (problem) return
        setSaving(true)
        setError(null)
        try {
            const body = { lines: input.lines, sections: input.sections, notes: notes.trim() }
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
        <AdaptiveCard>
            {error || catalog.error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error ?? catalog.error}
                </Alert>
            ) : null}
            <h6 className="mb-2">Lines (SD products)</h6>
            <QuotationItemsEditor
                products={catalog.products}
                loading={catalog.loading}
                items={items}
                onChange={setItems}
                highlights={highlights}
                stock={stock.stock}
                stockLoading={stock.loading}
            />
            <FormItem label="Notes" className="mt-4">
                <Input textArea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormItem>
            <div className="mt-4 flex items-center justify-end gap-3">
                {problem && dirty ? <span className="text-xs text-amber-700 dark:text-amber-300">{problem}</span> : null}
                <Button type="button" variant="solid" disabled={Boolean(problem)} loading={saving} onClick={() => void save()}>
                    {editing ? 'Save draft' : 'Create draft'}
                </Button>
            </div>
        </AdaptiveCard>
    )
}
