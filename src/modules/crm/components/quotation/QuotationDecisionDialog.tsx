'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import {
    acceptQuotation,
    cancelQuotation,
    rejectQuotation,
    reviseQuotation,
} from '@/modules/sd/services/quotationService'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import CrmSelect from '../CrmSelect'
import { enumOptions } from '../../utils/format'
import { QuotationHeadline, quotationLabel } from './QuotationSummary'
import { REVISION_REASONS, type Quotation, type RevisionReason } from '../../types'

export type QuotationDecision = 'accept' | 'reject' | 'cancel' | 'revise'

export type QuotationDecisionTarget = { decision: QuotationDecision; quotation: Quotation }

const COPY: Record<QuotationDecision, { title: string; confirm: string; description: string }> = {
    accept: {
        title: 'Accept',
        confirm: 'Mark accepted',
        description: 'Record that the customer accepted the quotation. Prices stay frozen; close the deal as won to create the SD sales order.',
    },
    reject: {
        title: 'Reject',
        confirm: 'Mark rejected',
        description: 'Record that the customer declined. You can revise a rejected quotation into a new draft.',
    },
    cancel: {
        title: 'Cancel',
        confirm: 'Cancel quotation',
        description: 'The quotation can no longer be sent, accepted or converted.',
    },
    revise: {
        title: 'Revise',
        confirm: 'Create revision',
        description: 'Creates the next revision as a draft with the same lines, re-priced from the current SD catalog. A sent or accepted quotation becomes superseded.',
    },
}

type QuotationDecisionDialogProps = {
    target: QuotationDecisionTarget | null
    onClose: () => void
    onDone: (result: Quotation, decision: QuotationDecision) => void
}

export default function QuotationDecisionDialog({ target, onClose, onDone }: QuotationDecisionDialogProps) {
    const [text, setText] = useState('')
    const [reason, setReason] = useState<RevisionReason | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setText('')
        setReason(null)
        setError(null)
    }, [target])

    const decision = target?.decision
    const trimmed = text.trim()
    const valid =
        decision === 'reject'
            ? Boolean(trimmed)
            : decision === 'revise'
              ? Boolean(reason) && (reason !== 'OTHER' || Boolean(trimmed))
              : true

    const submit = async () => {
        if (!target || !valid) return
        setSaving(true)
        setError(null)
        const id = target.quotation.id
        try {
            const result =
                target.decision === 'accept'
                    ? await acceptQuotation(id, { note: trimmed || undefined })
                    : target.decision === 'reject'
                      ? await rejectQuotation(id, { reason: trimmed })
                      : target.decision === 'cancel'
                        ? await cancelQuotation(id, { reason: trimmed || undefined })
                        : await reviseQuotation(id, { reason: reason!, notes: trimmed || undefined })
            onDone(result, target.decision)
        } catch (err) {
            setError(getApiErrorMessage(err, `Could not ${target.decision} the quotation`))
        } finally {
            setSaving(false)
        }
    }

    const copy = decision ? COPY[decision] : null
    const textLabel =
        decision === 'accept'
            ? 'Note (optional)'
            : decision === 'reject'
              ? 'Customer reason'
              : decision === 'cancel'
                ? 'Reason (optional)'
                : reason === 'OTHER'
                  ? 'Revision notes'
                  : 'Revision notes (optional)'

    return (
        <FormDialog
            isOpen={Boolean(target)}
            onClose={onClose}
            title={target && copy ? `${copy.title} ${quotationLabel(target.quotation)}` : 'Quotation'}
            description={copy?.description}
            footer={
                <>
                    <Button type="button" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        type="button"
                        variant="solid"
                        disabled={!valid}
                        loading={saving}
                        onClick={() => void submit()}
                    >
                        {copy?.confirm ?? 'Confirm'}
                    </Button>
                </>
            }
        >
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            {target ? (
                <div className="mb-4">
                    <QuotationHeadline quotation={target.quotation} />
                </div>
            ) : null}
            {decision === 'revise' ? (
                <FormItem label="Reason" asterisk>
                    <CrmSelect
                        options={enumOptions(REVISION_REASONS)}
                        value={reason}
                        placeholder="Why is it revised?"
                        onChange={(value) => setReason(value as RevisionReason | null)}
                    />
                </FormItem>
            ) : null}
            <FormItem label={textLabel} asterisk={decision === 'reject' || (decision === 'revise' && reason === 'OTHER')}>
                <Input textArea maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
            </FormItem>
        </FormDialog>
    )
}
