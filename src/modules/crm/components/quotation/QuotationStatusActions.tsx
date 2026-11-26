'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import QuotationDecisionDialog, {
    type QuotationDecisionTarget,
} from './QuotationDecisionDialog'
import QuotationSendDialog from './QuotationSendDialog'
import QuotationEmailComposer from './QuotationEmailComposer'
import type { Quotation } from '@/modules/sd/services/quotationService'

type QuotationStatusActionsProps = {
    quotation: Quotation
    /** `sd.quotations:update` — every lifecycle action needs it. */
    canManage: boolean
    /** A dirty DRAFT (unsaved edits) disables Send / Cancel so the saved state is never mutated behind edits. */
    busy?: boolean
    /** Reload after the quotation's status changed. */
    onChanged: () => void
    /** Revise returned a new DRAFT; the parent navigates to it. */
    onRevise: (next: Quotation) => void
}

const ACTION_COPY: Record<string, { label: string; solid?: boolean }> = {
    send: { label: 'Send', solid: true },
    email: { label: 'Email' },
    accept: { label: 'Accept', solid: true },
    reject: { label: 'Reject' },
    revise: { label: 'Revise' },
    cancel: { label: 'Cancel' },
}

/** Follows the SD status machine; no client-side transitions are invented. */
function actionsFor(status: string): string[] {
    switch (status) {
        case 'DRAFT':
            // Emailing needs the frozen PDF: Send first (the composer then opens automatically).
            return ['send', 'cancel']
        case 'SENT':
            return ['email', 'accept', 'reject', 'revise', 'cancel']
        case 'ACCEPTED':
            return ['email', 'revise', 'cancel']
        case 'REJECTED':
        case 'EXPIRED':
            return ['revise']
        default:
            return []
    }
}

export default function QuotationStatusActions({
    quotation,
    canManage,
    busy = false,
    onChanged,
    onRevise,
}: QuotationStatusActionsProps) {
    const [sending, setSending] = useState(false)
    const [composer, setComposer] = useState<{ quotation: Quotation; isResend: boolean } | null>(null)
    const [decision, setDecision] = useState<QuotationDecisionTarget | null>(null)

    if (!canManage) return null
    const actions = actionsFor(quotation.effectiveStatus)
    if (!actions.length) return null

    const locked = busy
    const run = {
        send: () => setSending(true),
        email: () => setComposer({ quotation, isResend: Boolean(quotation.lastEmailedAt) }),
        accept: () => setDecision({ decision: 'accept', quotation }),
        reject: () => setDecision({ decision: 'reject', quotation }),
        revise: () => setDecision({ decision: 'revise', quotation }),
        cancel: () => setDecision({ decision: 'cancel', quotation }),
    }

    return (
        <>
            <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
                {actions.map((key) => {
                    const copy = ACTION_COPY[key]
                    return (
                        <Button
                            key={key}
                            variant={copy.solid ? 'solid' : 'default'}
                            disabled={locked}
                            title={locked ? 'Save the draft before sending or cancelling' : undefined}
                            onClick={run[key as keyof typeof run]}
                        >
                            {key === 'email' && quotation.lastEmailedAt ? 'Resend email' : copy.label}
                        </Button>
                    )
                })}
            </div>
            <QuotationSendDialog
                quotation={sending ? quotation : null}
                onClose={() => setSending(false)}
                onSent={(sent) => {
                    setSending(false)
                    onChanged()
                    // Send freezes the quotation; the rep then composes the first email.
                    setComposer({ quotation: sent, isResend: false })
                }}
                onRepriced={() => onChanged()}
            />
            <QuotationEmailComposer
                quotation={composer?.quotation ?? null}
                isResend={composer?.isResend}
                onClose={() => setComposer(null)}
                onSent={onChanged}
            />
            <QuotationDecisionDialog
                target={decision}
                onClose={() => setDecision(null)}
                onDone={(result, selected) => {
                    setDecision(null)
                    if (selected === 'revise') onRevise(result)
                    else onChanged()
                }}
            />
        </>
    )
}