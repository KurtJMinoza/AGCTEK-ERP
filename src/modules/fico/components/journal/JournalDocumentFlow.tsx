'use client'

import Link from 'next/link'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FicoJournalFlowNode } from '../../types'

type Props = {
    nodes: FicoJournalFlowNode[]
}

export default function JournalDocumentFlow({ nodes }: Props) {
    if (!nodes.length) {
        return (
            <p className="text-sm text-gray-500">
                No upstream operational documents are linked to this journal yet.
            </p>
        )
    }

    return (
        <ol className="flex flex-col gap-2">
            {nodes.map((node, index) => (
                <li
                    key={node.key}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        node.highlight
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200 dark:border-gray-700'
                    }`}
                >
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{node.label}</p>
                        <p className="font-mono text-xs text-gray-500">
                            {node.documentNumber ?? node.documentId}
                        </p>
                    </div>
                    {node.status ? (
                        <StatusBadge tone="default">{node.status}</StatusBadge>
                    ) : null}
                    {node.href ? (
                        <Link href={node.href} className="text-xs font-medium text-primary hover:underline">
                            Open
                        </Link>
                    ) : null}
                </li>
            ))}
        </ol>
    )
}