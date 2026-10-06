'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import { sendQuotation } from '@/modules/sd/services/quotationService'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { apiErrorBody } from '../../utils/apiErrorBody'
import { decimal, formatMoney } from '../../utils/format'
import { QuotationHeadline, QuotationLinesTable, quotationLabel } from './QuotationSummary'
import type { Quotation, QuotationLineIssue, QuotationPriceChange } from '../../types'

type QuotationSendDialogProps = {
    /** Pass the reloaded quotation after a re-price so the dialog shows the saved prices. */
    quotation: Quotation | null
    onClose: () => void
    onSent: (quotation: Quotation) => void
    /** SD saved new catalog prices on the draft; reload it. */
    onRepriced: () => void
}

const todayInput = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * DRAFT → SENT. SD re-prices first: if catalog prices changed it saves them and refuses to send, so
 * the rep reviews the new prices and sends again. Nothing is sent automatically.
 */
export default function QuotationSendDialog({ quotation, onClose, onSent, onRepriced }: QuotationSendDialogProps) {
    const [validUntil, setValidUntil] = useState('')
    const [changes, setChanges] = useState<QuotationPriceChange[] | null>(null)
    const [unavailable, setUnavailable] = useState<QuotationLineIssue[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const quotationId = quotation?.id

    useEffect(() => {
        setValidUntil('')
        setChanges(null)
        setUnavailable(null)
        setError(null)
    }, [quotationId])

    const send = async () => {
        if (!quotation) return
        setSending(true)
        setError(null)
        setUnavailable(null)
        try {
            onSent(await sendQuotation(quotation.id, { validUntil: validUntil || undefined }))
        } catch (err) {
            const body = apiErrorBody<{ changedLines: QuotationPriceChange[]; lines: QuotationLineIssue[] }>(err)
            if (body?.code === 'QUOTATION_PRICES_CHANGED') {
                setChanges(body.changedLines ?? [])
                onRepriced()
            } else if (body?.code === 'QUOTATION_UNAVAILABLE_PRODUCTS') {
                setUnavailable(body.lines ?? [])
            } else {
                setError(getApiErrorMessage(err, 'Could not send the quotation'))
            }
        } finally {
            setSending(false)
        }
    }

    const changed = new Set(changes?.map((c) => c.lineNumber))

    return (
        <FormDialog
            isOpen={Boolean(quotation)}
            onClose={onClose}
            size="lg"
            title={quotation ? `Send ${quotationLabel(quotation)}` : 'Send quotation'}
            description="Sending freezes the quoted prices. Closing the deal as won converts this quotation into the SD sales order at these prices."
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" variant="solid" loading={sending} disabled={Boolean(unavailable)} onClick={() => void send()}>
                        {changes ? 'Send at updated prices' : 'Send quotation'}
                    </Button>
                </>
            }
        >
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            {changes && quotation ? (
                <Alert showIcon type="warning" className="mb-4" title="Catalog prices changed">
                    Review the updated prices before sending. The draft now carries the current SD catalog prices;
                    nothing was sent.
                    <ul className="mt-2 list-disc pl-5">
                        {changes.map((c) => (
                            <li key={c.lineNumber}>
                                Line {c.lineNumber} · {c.sku}:{' '}
                                {formatMoney(decimal(c.previousUnitPrice), quotation.currency)} →{' '}
                                <strong>{formatMoney(decimal(c.unitPrice), quotation.currency)}</strong>
                            </li>
                        ))}
                    </ul>
                </Alert>
            ) : null}
            {unavailable ? (
                <Alert showIcon type="danger" className="mb-4" title="Unavailable products">
                    Edit the draft and remove these lines before sending:{' '}
                    {unavailable.map((l) => `line ${l.lineNumber} (${l.sku})`).join(', ')}.
                </Alert>
            ) : null}
            {quotation ? (
                <>
                    <div className="mb-3">
                        <QuotationHeadline quotation={quotation} />
                    </div>
                    <QuotationLinesTable quotation={quotation} highlight={changed} />
                    <FormItem label="Valid until (last day)" className="mt-4" extra="Leave empty for 30 days from today.">
                        <Input type="date" min={todayInput()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                    </FormItem>
                </>
            ) : null}
        </FormDialog>
    )
}
