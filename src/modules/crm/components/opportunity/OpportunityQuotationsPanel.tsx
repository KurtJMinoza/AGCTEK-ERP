'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import QuotationDecisionDialog, {
    type QuotationDecision,
    type QuotationDecisionTarget,
} from '../quotation/QuotationDecisionDialog'
import QuotationEditorDialog, { type QuotationEditorTarget } from '../quotation/QuotationEditorDialog'
import QuotationSendDialog from '../quotation/QuotationSendDialog'
import { QuotationHeadline, QuotationLinesTable, quotationLabel } from '../quotation/QuotationSummary'
import { formatDate, formatEnumLabel } from '../../utils/format'
import { OPPORTUNITY_OPEN_STAGES, type Opportunity, type Quotation } from '../../types'

export const QUOTATIONS_ANCHOR = 'quotations'

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)
const QUOTABLE_STAGES: ReadonlySet<string> = new Set(['PROPOSAL', 'NEGOTIATION'])
const LIVE: ReadonlySet<string> = new Set(['DRAFT', 'SENT', 'ACCEPTED'])

type OpportunityQuotationsPanelProps = {
    opportunity: Opportunity
    quotations: Quotation[]
    loading: boolean
    error: string | null
    reload: () => Promise<void>
    /** crm:update + sd:create (both enforced server-side). */
    canCreate: boolean
    /** sd:update for edit / send / decisions / revise. */
    canManage: boolean
}

type Action = { label: string; run: () => void; solid?: boolean }

/** Odoo-style quotation history: the live quotation first, older revisions and closed ones below. */
export default function OpportunityQuotationsPanel({
    opportunity,
    quotations,
    loading,
    error,
    reload,
    canCreate,
    canManage,
}: OpportunityQuotationsPanelProps) {
    const [editor, setEditor] = useState<QuotationEditorTarget | null>(null)
    const [sendingId, setSendingId] = useState<string | null>(null)
    const [decision, setDecision] = useState<QuotationDecisionTarget | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    const open = OPEN_STAGES.has(opportunity.stage)
    const ordered = Boolean(opportunity.sdSalesOrderId)
    const live = quotations.find((q) => LIVE.has(q.effectiveStatus)) ?? null
    const canStartNew = canCreate && QUOTABLE_STAGES.has(opportunity.stage) && !ordered && !live
    const sending = quotations.find((q) => q.id === sendingId) ?? null

    const revisable = (q: Quotation) =>
        open &&
        !ordered &&
        !quotations.some((other) => other.previousRevisionId === q.id) &&
        (q.effectiveStatus === 'SENT' || q.effectiveStatus === 'ACCEPTED' || !live)

    const actionsFor = (q: Quotation): Action[] => {
        if (!canManage) return []
        const decide = (d: QuotationDecision) => () => setDecision({ decision: d, quotation: q })
        const revise: Action[] = revisable(q) ? [{ label: 'Revise', run: decide('revise') }] : []
        switch (q.effectiveStatus) {
            case 'DRAFT':
                return [
                    { label: 'Send', run: () => setSendingId(q.id), solid: true },
                    { label: 'Edit', run: () => setEditor({ mode: 'edit', quotation: q }) },
                    { label: 'Cancel', run: decide('cancel') },
                ]
            case 'SENT':
                return [
                    { label: 'Accept', run: decide('accept'), solid: true },
                    { label: 'Reject', run: decide('reject') },
                    ...revise,
                    { label: 'Cancel', run: decide('cancel') },
                ]
            case 'ACCEPTED':
                return [...revise, { label: 'Cancel', run: decide('cancel') }]
            case 'REJECTED':
            case 'EXPIRED':
                return revise
            default:
                return []
        }
    }

    const after = async (message: string) => {
        setNotice(message)
        await reload()
    }

    return (
        <AdaptiveCard id={QUOTATIONS_ANCHOR}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <h5>Quotations</h5>
                    <p className="text-xs text-gray-500">
                        SD quotations for {opportunity.customer.companyName}. Prices follow the SD catalog until
                        sent; closing as won converts the sent or accepted quotation.
                    </p>
                </div>
                {canStartNew ? (
                    <Button size="sm" variant="solid" onClick={() => setEditor({ mode: 'create' })}>
                        New quotation
                    </Button>
                ) : null}
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}
            {notice ? (
                <Alert showIcon closable type="success" className="mb-3" onClose={() => setNotice(null)}>
                    {notice}
                </Alert>
            ) : null}

            {quotations.length === 0 ? (
                <p className="text-sm text-gray-500">
                    {loading
                        ? 'Loading quotations…'
                        : QUOTABLE_STAGES.has(opportunity.stage)
                          ? 'No quotations yet.'
                          : 'No quotations. Quotations are created in the Proposal or Negotiation stage.'}
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {quotations.map((q) => {
                        const actions = actionsFor(q)
                        const isOpen = expanded === q.id
                        return (
                            <li key={q.id} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                                <QuotationHeadline quotation={q} />
                                <p className="mt-1 text-xs text-gray-500">
                                    Created {formatDate(q.createdAt)}
                                    {q.sentAt ? ` · sent ${formatDate(q.sentAt)}` : ''}
                                    {q.decidedAt ? ` · decided ${formatDate(q.decidedAt)}` : ''}
                                    {q.convertedAt ? ` · converted ${formatDate(q.convertedAt)}` : ''}
                                    {` · ${q.lines.length} line${q.lines.length === 1 ? '' : 's'}`}
                                </p>
                                {q.revisionReason ? (
                                    <p className="mt-1 text-xs text-gray-500">
                                        Revision: {formatEnumLabel(q.revisionReason)}
                                        {q.revisionNotes ? ` — ${q.revisionNotes}` : ''}
                                    </p>
                                ) : null}
                                {q.decisionReason || q.cancelReason ? (
                                    <p className="mt-1 text-xs text-gray-500">
                                        {q.cancelReason ? `Cancelled: ${q.cancelReason}` : `Customer: ${q.decisionReason}`}
                                    </p>
                                ) : null}
                                {q.effectiveStatus === 'EXPIRED' && q.status !== 'EXPIRED' ? (
                                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                        Validity ended; revise it to quote again.
                                    </p>
                                ) : null}
                                {q.lineIssues.length > 0 ? (
                                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                        {q.lineIssues.length} line{q.lineIssues.length === 1 ? '' : 's'} with unavailable
                                        products; edit the draft before sending.
                                    </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button size="xs" variant="plain" onClick={() => setExpanded(isOpen ? null : q.id)}>
                                        {isOpen ? 'Hide lines' : 'View lines'}
                                    </Button>
                                    {actions.map((a) => (
                                        <Button key={a.label} size="xs" variant={a.solid ? 'solid' : 'default'} onClick={a.run}>
                                            {a.label}
                                        </Button>
                                    ))}
                                </div>
                                {isOpen ? (
                                    <div className="mt-2">
                                        <QuotationLinesTable quotation={q} />
                                        {q.notes ? <p className="mt-2 text-xs text-gray-500">Notes: {q.notes}</p> : null}
                                    </div>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            )}

            <QuotationEditorDialog
                opportunity={opportunity}
                target={editor}
                onClose={() => setEditor(null)}
                onSaved={(q) => {
                    setEditor(null)
                    void after(`${quotationLabel(q)} saved as draft`)
                }}
            />
            <QuotationSendDialog
                quotation={sending}
                onClose={() => setSendingId(null)}
                onRepriced={() => void reload()}
                onSent={(q) => {
                    setSendingId(null)
                    void after(`${quotationLabel(q)} sent; prices are frozen until ${formatDate(q.validUntil)}`)
                }}
            />
            <QuotationDecisionDialog
                target={decision}
                onClose={() => setDecision(null)}
                onDone={(q, d) => {
                    setDecision(null)
                    void after(
                        d === 'revise'
                            ? `${quotationLabel(q)} created as a draft`
                            : `${quotationLabel(q)} ${formatEnumLabel(q.status).toLowerCase()}`,
                    )
                }}
            />
        </AdaptiveCard>
    )
}
