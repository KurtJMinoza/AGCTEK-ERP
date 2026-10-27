'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import Iso9001FoundationWorkflowStrip from '@/modules/mm/shared/components/Iso9001FoundationWorkflowStrip'
import {
    foundationService,
    type FoundationReadinessStep,
} from '../services/foundationService'

const ROUTE = '/modules/mm/foundation-setup'

const STEP_LINKS: Record<number, string> = {
    1: '/modules/mm/material-master/materials-skus',
    2: '/modules/mm/supplier-management/supplier-master',
    3: '/modules/mm/warehouse-management/putaway-rules',
    4: '/modules/mm/valuation/inventory-valuation',
}

function metricLines(step: FoundationReadinessStep) {
    return Object.entries(step.metrics).map(([k, v]) => (
        <li key={k} className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-800 dark:text-gray-200">
                {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}:
            </span>{' '}
            {v.toLocaleString()}
        </li>
    ))
}

const MmFoundationSetupPage = () => {
    const [data, setData] = useState<Awaited<
        ReturnType<typeof foundationService.getReadiness>
    > | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setData(await foundationService.getReadiness())
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return (
        <PageContainer>
            <Breadcrumb items={buildErpBreadcrumbs(ROUTE)} />
            <PageHeader
                title="MM Foundation Setup (ISO 9001)"
                description="Verify master data, warehouse structure, and valuation configuration before cycle counting and operational posting."
                actions={<Button onClick={load}>Refresh readiness</Button>}
            />
            <Iso9001FoundationWorkflowStrip />

            <div className="grid gap-4 md:grid-cols-2">
                {(data?.steps ?? []).map((step) => (
                    <AdaptiveCard key={step.key}>
                        <div className="flex items-start justify-between gap-3 p-4">
                            <div>
                                <p className="text-xs font-bold uppercase text-gray-400">
                                    Step {step.step}
                                </p>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {step.title}
                                </h3>
                                <p className="text-sm text-gray-500">{step.role}</p>
                            </div>
                            <StatusBadge tone={step.ready ? 'success' : 'warning'}>
                                {step.ready ? 'Ready' : 'Gap'}
                            </StatusBadge>
                        </div>
                        <ul className="space-y-1 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                            {metricLines(step)}
                        </ul>
                        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                            <Link
                                href={STEP_LINKS[step.step] ?? '#'}
                                className="text-sm font-medium text-primary hover:underline"
                            >
                                Open step {step.step} workspace →
                            </Link>
                        </div>
                    </AdaptiveCard>
                ))}
                {loading && !data ? (
                    <AdaptiveCard>
                        <p className="p-4 text-sm text-gray-500">Loading readiness…</p>
                    </AdaptiveCard>
                ) : null}
            </div>
            {data?.generatedAt ? (
                <p className="mt-4 text-xs text-gray-400">
                    Snapshot: {new Date(data.generatedAt).toLocaleString()}
                </p>
            ) : null}
        </PageContainer>
    )
}

export default MmFoundationSetupPage
