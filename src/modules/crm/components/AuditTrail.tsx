'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { formatUserName } from '../utils/format'
import type { CrmUserRef } from '../types'

export type AuditTrailEntry = {
    id: string
    at: string
    summary: string
    actor: CrmUserRef | null
}

type AuditTrailProps = {
    /** Stable identity of what is loaded (e.g. `ticket:<id>`); changing it reloads. */
    sourceKey: string
    load: () => Promise<AuditTrailEntry[]>
    /** Bump to reload after a change. */
    refreshToken?: number
    emptyText?: string
}

type Result = { key: string; entries: AuditTrailEntry[]; error: string | null }

/** Read-only lifecycle history (who / what / when), oldest first. */
export default function AuditTrail({
    sourceKey,
    load,
    refreshToken = 0,
    emptyText = 'No history recorded yet.',
}: AuditTrailProps) {
    const requestKey = `${sourceKey}#${refreshToken}`
    const [result, setResult] = useState<Result | null>(null)

    useEffect(() => {
        let active = true
        load()
            .then((entries) => {
                if (active) setResult({ key: requestKey, entries, error: null })
            })
            .catch((err) => {
                if (active) {
                    setResult({
                        key: requestKey,
                        entries: [],
                        error: getApiErrorMessage(err, 'Unable to load the history'),
                    })
                }
            })
        return () => {
            active = false
        }
        // `load` is recreated by callers each render; the request key identifies the data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey])

    if (!result || result.key !== requestKey) {
        return <p className="text-sm text-gray-500">Loading history…</p>
    }
    if (result.error) {
        return (
            <Alert showIcon type="warning">
                {result.error}
            </Alert>
        )
    }
    if (result.entries.length === 0) return <p className="text-sm text-gray-500">{emptyText}</p>
    return (
        <ol className="flex flex-col gap-1 text-sm">
            {result.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums text-gray-500">
                        {new Date(entry.at).toLocaleString()}
                    </span>
                    <span className="font-medium">{formatUserName(entry.actor, 'System')}</span>
                    <span>{entry.summary}</span>
                </li>
            ))}
        </ol>
    )
}
