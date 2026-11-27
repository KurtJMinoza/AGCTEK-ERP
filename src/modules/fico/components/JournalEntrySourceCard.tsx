'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/shared/StatusBadge'
import { ficoAccountingEventService } from '../services/ficoService'
import type { FicoAccountingEventDetail, FicoJournalEntry } from '../types'
import {
    isAutomatedJournal,
    journalAccountingEventHref,
    journalSourceDocumentHref,
    journalSourceModuleLabel,
} from '../utils/journalSourceLinks'

type Props = {
    entry: FicoJournalEntry
}

export default function JournalEntrySourceCard({ entry }: Props) {
    const automated = isAutomatedJournal(entry)
    const eventId = entry.mmAccountingEventId || entry.sourceEventId || null
    const [event, setEvent] = useState<FicoAccountingEventDetail | null>(null)
    const [eventLoading, setEventLoading] = useState(false)

    useEffect(() => {
        if (!automated || !entry.mmAccountingEventId) {
            setEvent(null)
            return
        }
        let cancelled = false
        setEventLoading(true)
        void ficoAccountingEventService
            .get(entry.mmAccountingEventId)
            .then((detail) => {
                if (!cancelled) setEvent(detail)
            })
            .catch(() => {
                if (!cancelled) setEvent(null)
            })
            .finally(() => {
                if (!cancelled) setEventLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [automated, entry.mmAccountingEventId])

    if (!automated) {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/40">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Source
                </div>
                <p className="mt-1 text-gray-800 dark:text-gray-100">
                    Entered manually
                </p>
            </div>
        )
    }

    const moduleLabel = journalSourceModuleLabel(entry)
    const docType =
        entry.sourceDocumentType ||
        event?.documentType ||
        entry.documentType ||
        '—'
    const docId = entry.sourceDocumentId || event?.documentId || null
    const docHref = journalSourceDocumentHref(
        entry.sourceModule,
        entry.sourceDocumentType || event?.documentType,
        docId,
    )
    const eventHref = journalAccountingEventHref(eventId)
    const eventStatus = event?.status

    return (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm dark:border-primary/30">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Source
            </div>
            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                Posted automatically from {moduleLabel}
                {docType && docType !== '—' ? ` · ${docType}` : ''}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                    <div className="text-[11px] font-semibold uppercase text-gray-400">
                        Module
                    </div>
                    <div className="mt-0.5 font-medium">{moduleLabel}</div>
                </div>
                <div>
                    <div className="text-[11px] font-semibold uppercase text-gray-400">
                        Source document
                    </div>
                    <div className="mt-0.5 break-all font-medium">
                        {docType}
                        {docId ? (
                            <span className="ml-1 font-mono text-xs text-gray-500">
                                {docId.slice(0, 14)}
                                {docId.length > 14 ? '…' : ''}
                            </span>
                        ) : null}
                    </div>
                </div>
                {eventId ? (
                    <div className="sm:col-span-2">
                        <div className="text-[11px] font-semibold uppercase text-gray-400">
                            Accounting event
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs">{eventId}</span>
                            {eventLoading ? (
                                <span className="text-xs text-gray-500">
                                    Loading status…
                                </span>
                            ) : eventStatus ? (
                                <StatusBadge
                                    tone={
                                        eventStatus === 'CONSUMED'
                                            ? 'success'
                                            : eventStatus === 'FAILED'
                                              ? 'danger'
                                              : 'warning'
                                    }
                                >
                                    {eventStatus}
                                </StatusBadge>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {docHref ? (
                    <Link href={docHref} onClick={(e) => e.stopPropagation()}>
                        <Button size="xs">Open document</Button>
                    </Link>
                ) : null}
                {eventHref ? (
                    <Link href={eventHref} onClick={(e) => e.stopPropagation()}>
                        <Button size="xs" variant="solid">
                            Open event
                        </Button>
                    </Link>
                ) : null}
            </div>
        </div>
    )
}
