'use client'

import classNames from 'classnames'
import { HiStar } from 'react-icons/hi'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatDate } from '@/modules/crm/utils/format'
import type { CrmEmailMessage } from '../services/crmEmailService'

export default function EmailMessageList({
    rows,
    selectedId,
    loading,
    emptyText,
    canStar,
    starringId,
    onSelect,
    onToggleStar,
}: {
    rows: CrmEmailMessage[]
    selectedId: string | null
    loading: boolean
    emptyText: string
    canStar: boolean
    starringId: string | null
    onSelect: (message: CrmEmailMessage) => void
    onToggleStar: (message: CrmEmailMessage) => void
}) {
    if (loading) {
        return <p className="p-4 text-sm text-gray-500">Loading…</p>
    }
    if (rows.length === 0) {
        return <p className="p-6 text-center text-sm text-gray-500">{emptyText}</p>
    }

    return (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
                <li key={row.id}>
                    <div
                        className={classNames(
                            'flex w-full items-start gap-2 px-3 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800/60',
                            selectedId === row.id && 'bg-primary/5',
                        )}
                    >
                        <button
                            type="button"
                            className="mt-0.5 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
                            disabled={!canStar || starringId === row.id}
                            aria-label={row.starred ? 'Unstar' : 'Star'}
                            onClick={(e) => {
                                e.stopPropagation()
                                onToggleStar(row)
                            }}
                        >
                            <HiStar
                                className={classNames(
                                    'text-base',
                                    row.starred ? 'text-amber-500' : 'text-gray-300',
                                )}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => onSelect(row)}
                            className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold">
                                    {row.direction === 'INBOUND' ||
                                    row.status === 'RECEIVED'
                                        ? row.fromEmail || row.toEmail
                                        : row.toName || row.toEmail}
                                </span>
                                {row.status === 'FAILED' ? (
                                    <StatusBadge tone="danger">Failed</StatusBadge>
                                ) : row.status === 'DRAFT' ? (
                                    <StatusBadge tone="warning">Draft</StatusBadge>
                                ) : row.isSpam ? (
                                    <StatusBadge tone="warning">Spam</StatusBadge>
                                ) : null}
                                {row.attachments.length > 0 ? (
                                    <span className="text-xs text-gray-400">
                                        {row.attachments.length} file
                                        {row.attachments.length === 1 ? '' : 's'}
                                    </span>
                                ) : null}
                            </div>
                            <div className="truncate text-sm text-gray-700 dark:text-gray-200">
                                {row.subject || '(no subject)'}
                            </div>
                            <div className="text-xs text-gray-400">
                                {row.receivedAt
                                    ? formatDate(row.receivedAt)
                                    : row.sentAt
                                      ? formatDate(row.sentAt)
                                      : formatDate(row.updatedAt)}
                                {row.quotation
                                    ? ` · ${row.quotation.quotationNumber} rev ${row.quotation.revision}`
                                    : ''}
                            </div>
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    )
}
