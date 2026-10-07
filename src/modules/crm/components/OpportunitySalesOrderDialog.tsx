'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import ProductLinesEditor, {
    chosenProductLines,
    emptyProductLine,
    productLinesValid,
    toProductLineInputs,
    useSdCatalog,
    type ProductLineForm,
} from './ProductLinesEditor'
import { QUOTATIONS_ANCHOR } from './opportunity/OpportunityQuotationsPanel'
import { QuotationHeadline, QuotationLinesTable, quotationLabel } from './quotation/QuotationSummary'
import { useOpportunityQuotations } from '../hooks/useOpportunityQuotations'
import { apiGetOpportunitySalesOrder } from '../services/crmApi'
import { apiErrorBody } from '../utils/apiErrorBody'
import { crmTone, decimal, formatDate, formatEnumLabel, formatMoney } from '../utils/format'
import type {
    CreateOpportunitySalesOrderInput,
    CreateOpportunitySalesOrderResult,
    LinkedSalesOrder,
    Opportunity,
} from '../types'

export const SD_SALES_ORDERS_PATH = '/modules/sd/sales-orders'

/** SD catalog prices carry no currency; SD rejects customers billed in another one. */
const SD_CATALOG_CURRENCY = 'PHP'

const CHANNEL_LABELS: Record<string, string> = { ECOMMERCE: 'E-commerce', POS: 'POS' }
const SOURCE_LABELS: Record<string, string> = { CRM: 'CRM', POS: 'POS', ERP: 'ERP' }

/** Channel / source of an SD order (e.g. E-commerce Â· CRM for Closed Won handoffs). */
export function SalesOrderOriginBadges({ order }: { order: Pick<LinkedSalesOrder, 'channel' | 'source'> }) {
    return (
        <span className="inline-flex items-center gap-1">
            <StatusBadge tone="info">
                {CHANNEL_LABELS[order.channel] ?? formatEnumLabel(order.channel)}
            </StatusBadge>
            {order.source ? (
                <StatusBadge>{SOURCE_LABELS[order.source] ?? formatEnumLabel(order.source)}</StatusBadge>
            ) : null}
        </span>
    )
}

/** Read-only summary of the SD order linked to an opportunity; SD owns the document. */
export function LinkedSalesOrderInfo({
    opportunityId,
    order: initial,
}: {
    opportunityId: string
    order?: LinkedSalesOrder | null
}) {
    const [order, setOrder] = useState<LinkedSalesOrder | null>(initial ?? null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (initial) return
        let active = true
        apiGetOpportunitySalesOrder(opportunityId)
            .then((row) => active && setOrder(row))
            .catch((err) => active && setError(getApiErrorMessage(err, 'Unable to load the SD order')))
        return () => {
            active = false
        }
    }, [opportunityId, initial])

    if (error) {
        return (
            <Alert showIcon type="warning">
                {error}
            </Alert>
        )
    }
    if (!order) return <p className="text-sm text-gray-500">Loading SD sales orderâ€¦</p>
    return (
        <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{order.orderNumber}</span>
                <StatusBadge tone={crmTone(order.status)}>
                    {formatEnumLabel(order.status)}
                </StatusBadge>
                <SalesOrderOriginBadges order={order} />
                <span className="text-gray-500">
                    {formatMoney(
                        order.totalAmount === null ? null : Number(order.totalAmount),
                        order.currency,
                    )}{' '}
                    Â· {order.lineCount} line{order.lineCount === 1 ? '' : 's'} Â· created{' '}
                    {formatDate(order.createdAt)}
                </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
                SD owns this order (confirmation, stock, delivery and billing). CRM keeps a
                read-only link.{' '}
                <Link className="text-primary underline" href={SD_SALES_ORDERS_PATH}>
                    Open SD sales orders
                </Link>
            </p>
        </div>
    )
}

type ReadinessItem = { label: string; ok: boolean; detail: string }

function ReadinessList({ items }: { items: ReadinessItem[] }) {
    return (
        <ul className="mb-4 flex flex-col gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            {items.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                    <StatusBadge tone={item.ok ? 'success' : 'danger'} className="shrink-0">
                        {item.ok ? 'Ready' : 'Missing'}
                    </StatusBadge>
                    <span>
                        <span className="font-medium">{item.label}</span>
                        <span className="text-gray-500"> Â· {item.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    )
}

export type SalesOrderDialogMode = 'win' | 'retry'

type OpportunitySalesOrderDialogProps = {
    opportunity: Opportunity | null
    /** `win` closes the deal and creates the order together; `retry` is the ERP handoff retry. */
    mode: SalesOrderDialogMode
    /** sd:create — enforced server-side as well. */
    canCreateOrder: boolean
    onClose: () => void
    onSubmit: (id: string, body: CreateOpportunitySalesOrderInput) => Promise<CreateOpportunitySalesOrderResult>
    onCreated: (result: CreateOpportunitySalesOrderResult) => void
    /** Jump to the quotations panel; without it the dialog links to the opportunity workspace. */
    onOpenQuotation?: () => void
}

/** Where the SD order comes from: the live quotation, or product lines priced from the catalog. */
type OrderSource = 'linked' | 'checking' | 'draft' | 'quotation' | 'lines'

export default function OpportunitySalesOrderDialog({
    opportunity,
    mode,
    canCreateOrder,
    onClose,
    onSubmit,
    onCreated,
    onOpenQuotation,
}: OpportunitySalesOrderDialogProps) {
    const [lines, setLines] = useState<ProductLineForm[]>(() => [emptyProductLine()])
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const linked = Boolean(opportunity?.sdSalesOrderId)
    const isWin = mode === 'win'

    const quotes = useOpportunityQuotations(opportunity && !linked ? opportunity.id : null)
    const active = quotes.active
    const source: OrderSource = linked
        ? 'linked'
        : !quotes.loaded
          ? 'checking'
          : active?.effectiveStatus === 'DRAFT'
            ? 'draft'
            : active && active.effectiveStatus !== 'EXPIRED'
              ? 'quotation'
              : 'lines'
    const expired = active?.effectiveStatus === 'EXPIRED' ? active : null
    const catalog = useSdCatalog(Boolean(opportunity) && source === 'lines')

    useEffect(() => {
        setLines([emptyProductLine()])
        setNotes('')
        setFormError(null)
    }, [opportunity])

    const chosen = chosenProductLines(lines)
    const linesValid = productLinesValid(lines)

    const customer = opportunity?.customer
    const customerCurrency = customer?.currency
    const sourceItem: ReadinessItem = (() => {
        switch (source) {
            case 'linked':
                return { label: 'SD sales order', ok: true, detail: 'Already linked; no new order is created' }
            case 'checking':
                return { label: 'Quotation', ok: false, detail: 'Checking SD quotations…' }
            case 'draft':
                return {
                    label: 'Quotation',
                    ok: false,
                    detail: `${quotationLabel(active!)} is a draft; send or cancel it first`,
                }
            case 'quotation':
                return {
                    label: 'Quotation',
                    ok: true,
                    detail: `${quotationLabel(active!)} (${formatEnumLabel(active!.effectiveStatus)}) is converted at its quoted prices`,
                }
            case 'lines':
                return {
                    label: 'Order lines',
                    ok: linesValid,
                    detail: linesValid
                        ? `${chosen.length} SD product line${chosen.length === 1 ? '' : 's'}`
                        : 'Add at least one SD product with a quantity above zero',
                }
        }
    })()
    const readiness: ReadinessItem[] = opportunity
        ? [
              {
                  label: 'SD customer',
                  ok: customer?.status === 'ACTIVE',
                  detail:
                      customer?.status === 'ACTIVE'
                          ? `${customer.companyName} (${customer.customerNumber})`
                          : `${customer?.companyName ?? 'Customer'} is ${formatEnumLabel(customer?.status ?? 'missing')}; SD only takes orders for active customers`,
              },
              {
                  label: 'Currency',
                  ok: !customerCurrency || customerCurrency === SD_CATALOG_CURRENCY,
                  detail:
                      !customerCurrency || customerCurrency === SD_CATALOG_CURRENCY
                          ? `SD prices in ${SD_CATALOG_CURRENCY}`
                          : `Customer is billed in ${customerCurrency}; SD prices in ${SD_CATALOG_CURRENCY} and does not convert. Fix the customer's currency in SD first.`,
              },
              ...(isWin
                  ? [
                        {
                            label: 'Estimated amount',
                            ok: opportunity.amount !== null,
                            detail:
                                opportunity.amount !== null
                                    ? `${formatMoney(opportunity.amount, opportunity.currency)} (CRM estimate; SD sets the price)`
                                    : 'Closing as won requires an amount on the opportunity',
                        },
                    ]
                  : []),
              sourceItem,
          ]
        : []
    const permitted = linked || canCreateOrder
    const ready = permitted && readiness.every((item) => item.ok)

    const body = (): CreateOpportunitySalesOrderInput => {
        const trimmed = notes.trim() || undefined
        if (source === 'quotation') return { quotationId: active!.id, notes: trimmed }
        if (source === 'lines') return { lines: toProductLineInputs(lines), notes: trimmed }
        return { notes: trimmed }
    }

    const submit = async () => {
        if (!opportunity || !ready) return
        setSaving(true)
        setFormError(null)
        try {
            onCreated(await onSubmit(opportunity.id, body()))
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    isWin
                        ? 'Could not close as won; the opportunity keeps its current stage'
                        : 'Failed to create the SD sales order',
                ),
            )
            if (apiErrorBody<{ code?: string }>(err)?.code?.startsWith('QUOTATION_')) void quotes.reload()
        } finally {
            setSaving(false)
        }
    }

    const openQuotation = onOpenQuotation ? (
        <Button size="sm" onClick={onOpenQuotation}>
            Open quotation
        </Button>
    ) : opportunity ? (
        <Link className="text-primary underline" href={`/crm/opportunities/${opportunity.id}#${QUOTATIONS_ANCHOR}`}>
            Open quotation
        </Link>
    ) : null

    const showForm = isWin || !linked
    const title = isWin ? 'Close as won' : linked ? 'SD sales order' : 'Retry ERP handoff'
    const confirmText =
        source === 'quotation'
            ? isWin
                ? 'Close as won & convert quotation'
                : 'Create SD order from quotation'
            : isWin
              ? linked
                  ? 'Close as won'
                  : 'Close as won & create SD order'
              : 'Create SD order'

    return (
        <FormDialog
            isOpen={Boolean(opportunity)}
            onClose={onClose}
            size="lg"
            title={opportunity ? `${title} · ${opportunity.name}` : title}
            description={
                !showForm
                    ? undefined
                    : isWin
                      ? linked
                          ? 'This deal already has its SD sales order; closing as won keeps that order.'
                          : 'SD creates the sales order (E-commerce channel, source CRM) and the deal closes as won in one step. If SD rejects the order, the deal stays in its current stage.'
                      : 'This deal is Closed Won without an SD sales order. SD creates the draft order; the stage does not change.'
            }
            footer={
                showForm ? (
                    <>
                        <Button type="button" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="solid"
                            disabled={!ready}
                            loading={saving}
                            onClick={() => void submit()}
                        >
                            {confirmText}
                        </Button>
                    </>
                ) : undefined
            }
        >
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}
            {quotes.error ? (
                <Alert showIcon type="warning" className="mb-4">
                    {quotes.error}
                </Alert>
            ) : null}

            {opportunity && !showForm ? (
                <LinkedSalesOrderInfo opportunityId={opportunity.id} />
            ) : (
                <>
                    {!permitted ? (
                        <Alert showIcon type="info" className="mb-4">
                            Creating an SD sales order requires SD create permission.
                        </Alert>
                    ) : null}
                    <ReadinessList items={readiness} />

                    {opportunity && source === 'linked' ? (
                        <LinkedSalesOrderInfo opportunityId={opportunity.id} />
                    ) : null}

                    {source === 'draft' && active ? (
                        <Alert showIcon type="info" className="mb-4">
                            <div className="flex flex-col gap-2">
                                <span>
                                    {quotationLabel(active)} is still a draft. Send or cancel the quotation before{' '}
                                    {isWin ? 'closing the opportunity as Won' : 'creating the SD order'}.
                                </span>
                                <span>{openQuotation}</span>
                            </div>
                        </Alert>
                    ) : null}

                    {source === 'quotation' && active ? (
                        <div className="mb-4 flex flex-col gap-2">
                            <h6>Convert {quotationLabel(active)}</h6>
                            <QuotationHeadline quotation={active} />
                            <QuotationLinesTable quotation={active} />
                            <p className="text-xs text-gray-500">
                                SD creates a draft order with these lines at the quoted prices (total{' '}
                                {decimal(active.totalAmount)} {active.currency}); the catalog is not re-priced.
                            </p>
                        </div>
                    ) : null}

                    {source === 'lines' ? (
                        <>
                            {expired ? (
                                <Alert showIcon type="warning" className="mb-4">
                                    <div className="flex flex-col gap-2">
                                        <span>
                                            {quotationLabel(expired)} expired on {formatDate(expired.validUntil)}. Revise
                                            it to order at quoted prices, or order from current catalog prices below.
                                        </span>
                                        <span>{openQuotation}</span>
                                    </div>
                                </Alert>
                            ) : null}
                            <h6 className="mb-2">Lines (SD products)</h6>
                            <ProductLinesEditor
                                products={catalog.products}
                                loading={catalog.loading}
                                lines={lines}
                                onChange={setLines}
                                disabled={!canCreateOrder}
                                estimateNote="SD sets the final price, currency and totals."
                            />
                            {catalog.error ? (
                                <Alert showIcon type="warning" className="mt-2">
                                    {catalog.error}
                                </Alert>
                            ) : null}
                        </>
                    ) : null}

                    {source !== 'linked' && source !== 'draft' ? (
                        <FormItem label="Notes for SD" className="mt-4">
                            <Input
                                textArea
                                maxLength={2000}
                                value={notes}
                                disabled={!canCreateOrder}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </FormItem>
                    ) : null}
                </>
            )}
        </FormDialog>
    )
}

