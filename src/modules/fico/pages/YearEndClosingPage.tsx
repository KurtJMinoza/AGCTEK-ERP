'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoErrorMessage, ficoYearEndClosingService } from '../services/ficoService'
import type { FicoYearEndOverview } from '../types'

const ROUTE = '/modules/fico/year-end-closing'

const YearEndClosingPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()))
    const [loading, setLoading] = useState(false)
    const [overview, setOverview] = useState<FicoYearEndOverview | null>(null)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        ficoYearEndClosingService
            .get({ companyId, fiscalYear: Number(fiscalYear) })
            .then(setOverview)
            .catch((error) =>
                notifyError(error, 'Unable to load year-end closing status.'),
            )
            .finally(() => setLoading(false))
    }, [companyId, fiscalYear])

    useEffect(() => {
        load()
    }, [load])

    const run = async (action: 'validate' | 'approve' | 'execute') => {
        if (!companyId) return
        setLoading(true)
        try {
            await ficoYearEndClosingService[action]({
                companyId,
                fiscalYear: Number(fiscalYear),
            })
            notifySuccess(
                action === 'validate'
                    ? 'Validation completed.'
                    : action === 'approve'
                      ? 'Year-end run approved.'
                      : 'Year-end closing journal posted.',
            )
            load()
        } catch (error) {
            const payload = (error as { response?: { data?: { code?: string; message?: string } } })
                ?.response?.data
            const msg = payload?.message ?? ficoErrorMessage(error, 'Year-end action failed.')
            notifyError(new Error(msg), msg)
        } finally {
            setLoading(false)
        }
    }

    const runStatus = overview?.run?.status
    const journalId = overview?.closingJournal?.id ?? overview?.run?.closingJournalEntryId

    return (
        <PageContainer>
            <PageHeader
                title="Year-End Closing"
                description="Close income and expense to retained earnings through one idempotent system journal. Balance sheet amounts stay in the ledger — no duplicate carryforward opening batch."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <FormItem className="mb-0" label="Fiscal year">
                            <Input
                                className="w-28"
                                value={fiscalYear}
                                onChange={(e) => setFiscalYear(e.target.value)}
                            />
                        </FormItem>
                        <Button loading={loading} onClick={load}>
                            Refresh
                        </Button>
                    </div>
                }
            />

            <AdaptiveCard className="mb-4 p-4 text-sm text-gray-600 dark:text-gray-300">
                {overview?.carryforwardStrategy}
            </AdaptiveCard>

            <div className="mb-4 flex flex-wrap gap-2">
                <Button loading={loading} onClick={() => run('validate')}>
                    Validate
                </Button>
                <Button
                    variant="twoTone"
                    loading={loading}
                    disabled={runStatus !== 'VALIDATED'}
                    onClick={() => run('approve')}
                >
                    Approve
                </Button>
                <Button
                    variant="solid"
                    loading={loading}
                    disabled={runStatus !== 'APPROVED'}
                    onClick={() => run('execute')}
                >
                    Execute closing
                </Button>
                <Link href="/modules/fico/accounting-reconciliation">
                    <Button variant="plain">Reconciliation</Button>
                </Link>
                <Link href="/modules/fico/trial-balance">
                    <Button variant="plain">Trial balance</Button>
                </Link>
            </div>

            {overview?.run ? (
                <AdaptiveCard className="p-4 text-sm">
                    <p>
                        Run status: <strong>{overview.run.status}</strong>
                    </p>
                    {journalId ? (
                        <p className="mt-2">
                            Closing journal:{' '}
                            <Link
                                className="text-primary hover:underline"
                                href={`/modules/fico/journal-entries/${journalId}`}
                            >
                                Open document
                            </Link>
                        </p>
                    ) : null}
                    <p className="mt-2 text-xs text-gray-500">
                        Reversal is only through the authorized journal reversal workflow — not
                        by re-running year-end.
                    </p>
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}

export default YearEndClosingPage