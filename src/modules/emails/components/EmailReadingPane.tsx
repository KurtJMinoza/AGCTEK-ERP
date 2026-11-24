'use client'

import Link from 'next/link'
import { HiOutlineRefresh, HiStar } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatDate } from '@/modules/crm/utils/format'
import type { CrmEmailMessage } from '../services/crmEmailService'

export default function EmailReadingPane({
    message,
    canStar,
    canModerate,
    starring,
    retrying,
    movingSpam,
    onToggleStar,
    onRetry,
    onSetSpam,
}: {
    message: CrmEmailMessage | null
    canStar: boolean
    canModerate: boolean
    starring: boolean
    retrying: boolean
    movingSpam: boolean
    onToggleStar: (message: CrmEmailMessage) => void
    onEdit: (message: CrmEmailMessage) => void
    onRetry: (message: CrmEmailMessage) => void
    onSetSpam: (message: CrmEmailMessage, isSpam: boolean) => void
}) {
    if (!message || message.status === 'DRAFT') {
        return (
            <p className="text-sm text-gray-500">
                Select a message to read it here. Drafts open in Compose.
            </p>
        )
    }

    const inbound = message.direction === 'INBOUND' || message.status === 'RECEIVED'

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">
                            {message.subject || '(no subject)'}
                        </h2>
                        {message.status === 'FAILED' ? (
                            <StatusBadge tone="danger">Failed</StatusBadge>
                        ) : inbound ? (
                            <StatusBadge tone={message.isSpam ? 'warning' : 'info'}>
                                {message.isSpam ? 'Spam' : 'Inbox'}
                            </StatusBadge>
                        ) : (
                            <StatusBadge tone="success">Sent</StatusBadge>
                        )}
                    </div>
                    {inbound ? (
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                            From {message.fromEmail || '(unknown)'}
                        </div>
                    ) : null}
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                        To{' '}
                        {message.toName
                            ? `${message.toName} <${message.toEmail}>`
                            : message.toEmail}
                    </div>
                    {!inbound && message.fromEmail ? (
                        <div className="text-xs text-gray-400">
                            From {message.fromEmail}
                        </div>
                    ) : null}
                    {inbound && message.receivedAt ? (
                        <div className="text-xs text-gray-400">
                            Received {formatDate(message.receivedAt)}
                        </div>
                    ) : null}
                    {!inbound && message.sentAt ? (
                        <div className="text-xs text-gray-400">
                            Sent {formatDate(message.sentAt)}
                        </div>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="plain"
                        icon={
                            <HiStar
                                className={
                                    message.starred
                                        ? 'text-amber-500'
                                        : 'text-gray-400'
                                }
                            />
                        }
                        disabled={!canStar || starring}
                        loading={starring}
                        onClick={() => onToggleStar(message)}
                    >
                        {message.starred ? 'Starred' : 'Star'}
                    </Button>
                    {inbound ? (
                        <Button
                            size="sm"
                            variant="solid"
                            disabled={!canModerate || movingSpam}
                            loading={movingSpam}
                            onClick={() => onSetSpam(message, !message.isSpam)}
                        >
                            {message.isSpam ? 'Not spam' : 'Move to Spam'}
                        </Button>
                    ) : null}
                    {message.status === 'FAILED' ? (
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlineRefresh />}
                            disabled={retrying}
                            loading={retrying}
                            onClick={() => onRetry(message)}
                        >
                            Retry
                        </Button>
                    ) : null}
                </div>
            </div>

            {message.lastError ? (
                <Alert showIcon type="danger">
                    {message.lastError}
                </Alert>
            ) : null}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {message.customer ? (
                    <Link
                        className="text-primary underline"
                        href={`/crm/customers/${message.customer.id}`}
                    >
                        {message.customer.companyName}
                    </Link>
                ) : null}
                {message.opportunity ? (
                    <Link
                        className="text-primary underline"
                        href={`/crm/opportunities/${message.opportunity.id}`}
                    >
                        {message.opportunity.name}
                    </Link>
                ) : null}
                {message.quotation ? (
                    <span className="text-gray-500">
                        Quotation {message.quotation.quotationNumber} rev{' '}
                        {message.quotation.revision}
                    </span>
                ) : null}
            </div>

            <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
                {message.bodyText || '(empty message)'}
            </pre>

            {message.attachments.length > 0 ? (
                <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                        Attachments
                    </div>
                    <ul className="space-y-1 text-sm">
                        {message.attachments.map((a) => (
                            <li key={a.id}>
                                {a.kind === 'QUOTATION_PDF' ? 'PDF · ' : ''}
                                {a.fileName}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    )
}
