'use client'

import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import usePermissions from '@/utils/hooks/usePermissions'
import { useOpportunity } from '../hooks/useOpportunity'
import { useQuotation } from '../hooks/useQuotation'
import { useOpportunityQuotations } from '../hooks/useOpportunityQuotations'
import QuotationComposeForm from '../components/quotation/QuotationComposeForm'
import QuotationStatusActions from '../components/quotation/QuotationStatusActions'
import DownloadQuotationPdfButton from '../components/quotation/DownloadQuotationPdfButton'
import {
    QuotationHeadline,
    QuotationLinesTable,
    QuotationStatusBadge,
    quotationLabel,
} from '../components/quotation/QuotationSummary'
import { crmQuotationBreadcrumbs } from '../utils/breadcrumbs'
import { opportunityHref, quotationHref } from '../utils/deepLinks'
import { formatDate, formatEnumLabel } from '../utils/format'
import type { Quotation } from '@/modules/sd/services/quotationService'

const QUOTABLE_STAGES: ReadonlySet<string> = new Set(['PROPOSAL', 'NEGOTIATION'])

const Skeleton = ({ className }: { className: string }) => (
    <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700 ${className}`} />
)

const Meta = ({ label, children }: { label: string; children?: ReactNode }) => (
    <span className="whitespace-nowrap">
        <span className="text-gray-400">{label} </span>
        {children}
    </span>
)

/** A quotation belongs to one opportunity; `quotationId === 'new'` composes without creating. */
export default function QuotationPage({
    quotationId: routedQuotationId,
}: { quotationId?: string } = {}) {
    const params = useParams<{ id: string; quotationId: string }>()
    const router = useRouter()
    const opportunityId = params?.id ?? ''
    const rawQuotationId = routedQuotationId ?? params?.quotationId ?? ''
    const isNew = rawQuotationId === 'new'
    const quotationId = isNew ? 'new' : rawQuotationId
    const {
        opportunity,
        loading: opportunityLoading,
        error: opportunityError,
        notFound: opportunityNotFound,
        reload: reloadOpportunity,
    } = useOpportunity(opportunityId)
    const {
        quotation,
        loading: quotationLoading,
        error: quotationError,
        notFound: quotationNotFound,
        reload: reloadQuotation,
    } = useQuotation(isNew ? null : quotationId)
    const opportunityQuotations = useOpportunityQuotations(opportunityId ? opportunityId : null)
    const { can } = usePermissions()
    const canQuoteCreate = can('sd.quotations', 'create')
    const canQuoteUpdate = can('sd.quotations', 'update')
    const [dirty, setDirty] = useState(false)

    useEffect(() => {
        if (!dirty) return
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [dirty])

    const leaveTo = (href: string) => {
        if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
        router.push(href)
    }

    const handleSaved = (saved: Quotation) => {
        setDirty(false)
        if (isNew) {
            router.replace(quotationHref(opportunity!.id, saved.id))
        } else {
            void reloadQuotation()
        }
    }

    const handleRevise = (next: Quotation) => {
        setDirty(false)
        router.replace(quotationHref(opportunity!.id, next.id))
    }

    const reloadQuotationNow = () => void reloadQuotation()

    if (!opportunity) {
        return (
            <PageContainer>
                <PageHeader title="Quotation" breadcrumbs={crmQuotationBreadcrumbs('', '', 'Quotation')} />
                {opportunityNotFound ? (
                    <Alert showIcon type="warning" title="Opportunity not found">
                        It may have been removed.{' '}
                        <Link href="/crm/opportunities" className="underline">
                            Back to opportunities
                        </Link>
                    </Alert>
                ) : opportunityError ? (
                    <Alert showIcon type="danger" title="Unable to load opportunity">
                        <span className="mr-2">{opportunityError}</span>
                        <Button size="xs" onClick={() => void reloadOpportunity()} loading={opportunityLoading}>
                            Retry
                        </Button>
                    </Alert>
                ) : (
                    <>
                        <Skeleton className="h-8" />
                        <Skeleton className="mt-2 h-4 w-1/2" />
                        <div className="mt-4 flex flex-col gap-3">
                            <Skeleton className="h-32" />
                        </div>
                    </>
                )}
            </PageContainer>
        )
    }

    const label = isNew ? 'New' : quotation ? quotationLabel(quotation) : 'Quotation'
    const title = isNew ? 'New quotation' : quotation ? quotationLabel(quotation) : 'Quotation'
    const live = opportunityQuotations.active
    const successor = quotation
        ? opportunityQuotations.quotations.find((other) => other.previousRevisionId === quotation.id) ?? null
        : null

    return (
        <PageContainer>
            <PageHeader
                breadcrumbs={crmQuotationBreadcrumbs(opportunity.name, opportunity.id, label)}
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        {title}
                        {quotation ? <QuotationStatusBadge quotation={quotation} /> : null}
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <Meta label="Customer">
                            <Link
                                href={`/crm/customers/${opportunity.customerId}`}
                                className="font-medium text-primary hover:underline"
                            >
                                {opportunity.customer.companyName}
                            </Link>
                        </Meta>
                        <Meta label="Opportunity">
                            <Link
                                href={opportunityHref(opportunity.id)}
                                className="font-medium text-primary hover:underline"
                            >
                                {opportunity.name}
                            </Link>
                        </Meta>
                        {quotation ? (
                            <>
                                <Meta label="Created">{formatDate(quotation.createdAt)}</Meta>
                                <Meta label="Updated">{formatDate(quotation.updatedAt)}</Meta>
                            </>
                        ) : null}
                    </span>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {quotation ? <DownloadQuotationPdfButton quotation={quotation} /> : null}
                        <Button size="sm" variant="plain" onClick={() => leaveTo(opportunityHref(opportunity.id))}>
                            Back to opportunity
                        </Button>
                    </div>
                }
            />

            {isNew ? (
                opportunityQuotations.loading ? (
                    <div className="flex flex-col gap-3">
                        <Skeleton className="h-8" />
                        <Skeleton className="h-32" />
                    </div>
                ) : !canQuoteCreate ? (
                    <Alert showIcon type="warning" title="No permission to create quotations">
                        Ask an administrator to grant you{' '}
                        <span className="font-mono">sd.quotations · create</span>.
                    </Alert>
                ) : !QUOTABLE_STAGES.has(opportunity.stage) ? (
                    <Alert showIcon type="info" title="Quotations are created in Proposal or Negotiation">
                        This opportunity is {formatEnumLabel(opportunity.stage)}; move it to Proposal or
                        Negotiation to quote it.
                    </Alert>
                ) : opportunity.sdSalesOrderId ? (
                    <Alert showIcon type="info" title="Already has an SD sales order">
                        This opportunity already has its SD sales order; it cannot be quoted again.
                    </Alert>
                ) : live ? (
                    <Alert showIcon type="info" title="Draft quotations are created by revising">
                        This opportunity already has an active quotation ({quotationLabel(live)},{' '}
                        {formatEnumLabel(live.status)}). Work on it or revise it instead.{' '}
                        <Link href={quotationHref(opportunity.id, live.id)} className="underline">
                            Open {quotationLabel(live)}
                        </Link>
                    </Alert>
                ) : (
                    <QuotationComposeForm
                        opportunity={opportunity}
                        onSaved={handleSaved}
                        onDirtyChange={setDirty}
                    />
                )
            ) : quotationNotFound ? (
                <Alert showIcon type="warning" title="Quotation not found">
                    It may have been removed or revised.{' '}
                    <Link href={opportunityHref(opportunity.id)} className="underline">
                        Back to {opportunity.name}
                    </Link>
                </Alert>
            ) : quotationError ? (
                <Alert showIcon type="danger" title="Unable to load quotation">
                    <span className="mr-2">{quotationError}</span>
                    <Button size="xs" onClick={() => void reloadQuotation()} loading={quotationLoading}>
                        Retry
                    </Button>
                </Alert>
            ) : quotation && quotation.status === 'DRAFT' && canQuoteUpdate ? (
                <>
                    <QuotationStatusActions
                        quotation={quotation}
                        canManage={canQuoteUpdate}
                        busy={dirty}
                        onChanged={reloadQuotationNow}
                        onRevise={handleRevise}
                    />
                    <QuotationComposeForm
                        opportunity={opportunity}
                        initialQuotation={quotation}
                        onSaved={handleSaved}
                        onDirtyChange={setDirty}
                    />
                </>
            ) : quotation ? (
                <>
                    {quotation.status === 'ACCEPTED' ? (
                        <Alert showIcon type="success" className="mb-4" title="Accepted">
                            Close the opportunity as won to continue.{' '}
                            <Link href={opportunityHref(opportunity.id)} className="underline">
                                Open {opportunity.name}
                            </Link>
                        </Alert>
                    ) : null}
                    {quotation.status === 'SUPERSEDED' ? (
                        <Alert showIcon type="info" className="mb-4" title="Replaced by a revision">
                            {successor ? (
                                <>
                                    Work on the latest revision:{' '}
                                    <Link href={quotationHref(opportunity.id, successor.id)} className="underline">
                                        {quotationLabel(successor)}
                                    </Link>
                                    .
                                </>
                            ) : (
                                'Work on the latest revision of this quotation.'
                            )}
                        </Alert>
                    ) : null}
                    {quotation.status === 'CONVERTED' ? (
                        <Alert showIcon type="success" className="mb-4" title="Converted">
                            Converted into the SD sales order when this deal closed as won.{' '}
                            <Link href={opportunityHref(opportunity.id)} className="underline">
                                View {opportunity.name}
                            </Link>
                        </Alert>
                    ) : null}
                    <QuotationStatusActions
                        quotation={quotation}
                        canManage={canQuoteUpdate}
                        onChanged={reloadQuotationNow}
                        onRevise={handleRevise}
                    />
                    <QuotationBody quotation={quotation} />
                </>
            ) : (
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-10" />
                    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                        <Skeleton className="h-6 w-1/3" />
                        <Skeleton className="mt-3 h-24" />
                    </div>
                </div>
            )}
        </PageContainer>
    )
}

function QuotationBody({ quotation }: { quotation: Quotation }) {
    return (
        <AdaptiveCard>
            <div className="mb-4">
                <QuotationHeadline quotation={quotation} />
            </div>
            {quotation.revisionReason ? (
                <p className="mb-2 text-xs text-gray-500">
                    Revision: {formatEnumLabel(quotation.revisionReason)}
                    {quotation.revisionNotes ? ` — ${quotation.revisionNotes}` : ''}
                </p>
            ) : null}
            {quotation.sentAt ? (
                <p className="mb-2 text-xs text-gray-500">Sent {formatDate(quotation.sentAt)}.</p>
            ) : null}
            {quotation.decisionReason ? (
                <p className="mb-2 text-xs text-gray-500">
                    Customer: {quotation.decisionReason} ({formatEnumLabel(quotation.status)}).
                </p>
            ) : null}
            {quotation.cancelReason ? (
                <p className="mb-2 text-xs text-gray-500">Cancelled: {quotation.cancelReason}.</p>
            ) : null}
            <QuotationLinesTable quotation={quotation} />
            {quotation.notes ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Notes: {quotation.notes}</p> : null}
        </AdaptiveCard>
    )
}