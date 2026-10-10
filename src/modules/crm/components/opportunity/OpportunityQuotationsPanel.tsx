'use client'

import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { QuotationHeadline, quotationLabel } from '../quotation/QuotationSummary'
import { formatDate, formatEnumLabel } from '../../utils/format'
import { quotationHref } from '../../utils/deepLinks'
import { OPPORTUNITY_OPEN_STAGES, type Opportunity, type Quotation } from '../../types'

export const QUOTATIONS_ANCHOR = 'quotations'

const QUOTABLE_STAGES: ReadonlySet<string> = new Set(['PROPOSAL', 'NEGOTIATION'])
const LIVE: ReadonlySet<string> = new Set(['DRAFT', 'SENT', 'ACCEPTED'])

type OpportunityQuotationsPanelProps = {
    opportunity: Opportunity
    quotations: Quotation[]
    loading: boolean
    error: string | null
    /** crm:update + sd:create (both enforced server-side). */
    canCreate: boolean
}

/**
 * Quotation index for the deal workspace: one row per quotation with its status and totals.
 * Composing and lifecycle happen on the quotation page (`/crm/opportunities/:id/quotations/...`).
 */
export default function OpportunityQuotationsPanel({
    opportunity,
    quotations,
    loading,
    error,
    canCreate,
}: OpportunityQuotationsPanelProps) {
    const ordered = Boolean(opportunity.sdSalesOrderId)
    const live = quotations.find((q) => LIVE.has(q.effectiveStatus)) ?? null
    const canStartNew = canCreate && QUOTABLE_STAGES.has(opportunity.stage) && !ordered && !live

    return (
        <AdaptiveCard id={QUOTATIONS_ANCHOR}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <h5>Quotations</h5>
                    <p className="text-xs text-gray-500">
                        SD quotations for {opportunity.customer.companyName}. Compose and send each quotation
                        on its own page; closing as won converts a SENT or ACCEPTED quotation.
                    </p>
                </div>
                {canStartNew ? (
                    <Link href={quotationHref(opportunity.id, 'new')}>
                        <Button size="sm" variant="solid">
                            New quotation
                        </Button>
                    </Link>
                ) : null}
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
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
                    {quotations.map((q) => (
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
                                    products; resolve before sending.
                                </p>
                            ) : null}
                            <div className="mt-2">
                                <Link href={quotationHref(opportunity.id, q.id)}>
                                    <Button size="xs" variant="plain">
                                        Open {quotationLabel(q)}
                                    </Button>
                                </Link>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </AdaptiveCard>
    )
}