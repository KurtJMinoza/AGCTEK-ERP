'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import usePermissions from '@/utils/hooks/usePermissions'
import {
    HiOutlineArrowLeft,
    HiOutlineClipboardList,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlinePlus,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { notifyError, notifySuccess } from '../components/FicoCompanySelect'
import { ficoJournalService } from '../services/ficoService'
import type { FicoJournalEntry } from '../types'
import { FicoStatusCell, formatFicoDate } from '../components/ficoTableUi'

const JOURNAL_ROUTE = '/modules/fico/journal-entries'

const APPROVAL_STATUS_TONES: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
    DRAFT: 'default',
    PENDING_APPROVAL: 'info',
    APPROVED: 'success',
    POSTED: 'success',
    REJECTED: 'danger',
    REVERSED: 'warning',
}

const JournalEntryDetailsPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const journalEntryId = Array.isArray(idParam) ? idParam[0] : idParam
    const { can } = usePermissions()
    const canUpdate = can('fico.journal-entries', 'update')

    const [entry, setEntry] = useState<FicoJournalEntry | null>(null)
    const [loading, setLoading] = useState(true)
    const [action, setAction] = useState<
        'SUBMIT' | 'APPROVE' | 'REJECT' | 'RESUBMIT' | 'POST' | null
    >(null)
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(() => {
        if (!journalEntryId) return
        setLoading(true)
        ficoJournalService
            .get(journalEntryId, '')
            .then((record) => setEntry(record))
            .catch((error) => notifyError(error, 'Unable to load the journal entry.'))
            .finally(() => setLoading(false))
    }, [journalEntryId])

    useEffect(() => {
        load()
    }, [load])

    const submitAction = async () => {
        if (!entry || !action) return
        setSaving(true)
        try {
            const payload = reason.trim() ? { reason: reason.trim() } : {}
            switch (action) {
                case 'SUBMIT':
                    await ficoJournalService.submit(entry.id, payload.reason)
                    notifySuccess('Journal entry submitted for approval.')
                    break
                case 'APPROVE':
                    await ficoJournalService.approve(entry.id, payload.reason)
                    notifySuccess('Journal entry approved.')
                    break
                case 'REJECT':
                    await ficoJournalService.reject(entry.id, payload.reason)
                    notifySuccess('Journal entry rejected.')
                    break
                case 'RESUBMIT':
                    await ficoJournalService.resubmit(entry.id)
                    notifySuccess('Journal entry resubmitted for approval.')
                    break
                case 'POST':
                    await ficoJournalService.post(entry.id)
                    notifySuccess('Journal entry posted to the general ledger.')
                    break
            }
            setAction(null)
            setReason('')
            load()
        } catch (error) {
            notifyError(error, 'Unable to process the journal entry action.')
        } finally {
            setSaving(false)
        }
    }

    if (!journalEntryId) {
        return (
            <PageContainer>
                <PageHeader
                    title="Journal Entry Details"
                    breadcrumbs={buildErpBreadcrumbs(JOURNAL_ROUTE)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        No journal entry was selected.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    if (loading && !entry) {
        return (
            <PageContainer>
                <PageHeader
                    title="Journal Entry Details"
                    description="Loading journal entry…"
                    breadcrumbs={buildErpBreadcrumbs(`${JOURNAL_ROUTE}/${journalEntryId}`)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        Loading journal entry…
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    if (!entry) {
        return (
            <PageContainer>
                <PageHeader
                    title="Journal Entry Details"
                    breadcrumbs={buildErpBreadcrumbs(`${JOURNAL_ROUTE}/${journalEntryId}`)}
                />
                <AdaptiveCard>
                    <p className="py-10 text-center text-sm text-gray-500">
                        The journal entry could not be loaded.
                    </p>
                </AdaptiveCard>
            </PageContainer>
        )
    }

    const totalDebit = entry.lines?.reduce(
        (sum, line) => sum + (Number(line.debitAmount) || 0),
        0,
    ) || 0
    const totalCredit = entry.lines?.reduce(
        (sum, line) => sum + (Number(line.creditAmount) || 0),
        0,
    ) || 0

    return (
        <PageContainer>
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-primary">
                            {entry.documentNumber ?? '—'}
                        </span>
                        <span>{entry.description ?? 'Journal entry'}</span>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-2">
                        <FicoStatusCell
                            status={entry.approvalStatus}
                            map={APPROVAL_STATUS_TONES}
                        />
                        <FicoStatusCell
                            status={entry.status}
                            map={{
                                POSTED: 'success' as const,
                                DRAFT: 'default' as const,
                                REVERSED: 'warning' as const,
                                LEGACY: 'default' as const,
                            }}
                        />
                    </span>
                }
                breadcrumbs={buildErpBreadcrumbs(
                    `${JOURNAL_ROUTE}/${entry.id}`,
                    { detailLabel: entry.documentNumber ?? entry.id },
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            onClick={() => router.push(JOURNAL_ROUTE)}
                        >
                            <HiOutlineArrowLeft className="mr-1.5 h-4 w-4" />
                            Back to List
                        </Button>
                        <Button
                            variant="plain"
                            onClick={load}
                            loading={loading}
                        >
                            <HiOutlineRefresh className="mr-1.5 h-4 w-4" />
                            Refresh
                        </Button>
                        {canUpdate && entry.approvalStatus === 'DRAFT' ? (
                            <Button
                                variant="default"
                                onClick={() => {
                                    setReason('')
                                    setAction('SUBMIT')
                                }}
                            >
                                <HiOutlineClipboardList className="mr-1.5 h-4 w-4" />
                                Submit for approval
                            </Button>
                        ) : null}
                        {canUpdate &&
                        entry.approvalStatus === 'PENDING_APPROVAL' ? (
                            <>
                                <Button
                                    variant="default"
                                    onClick={() => {
                                        setReason('')
                                        setAction('APPROVE')
                                    }}
                                >
                                    <HiOutlineLockOpen className="mr-1.5 h-4 w-4" />
                                    Approve
                                </Button>
                                <Button
                                    variant="default"
                                    onClick={() => {
                                        setReason('')
                                        setAction('REJECT')
                                    }}
                                >
                                    <HiOutlineLockClosed className="mr-1.5 h-4 w-4" />
                                    Reject
                                </Button>
                            </>
                        ) : null}
                        {canUpdate &&
                        entry.approvalStatus === 'REJECTED' ? (
                            <Button
                                variant="default"
                                onClick={() => {
                                    setReason('')
                                    setAction('RESUBMIT')
                                }}
                            >
                                <HiOutlineClipboardList className="mr-1.5 h-4 w-4" />
                                Resubmit for approval
                            </Button>
                        ) : null}
                        {canUpdate &&
                        entry.approvalStatus === 'APPROVED' ? (
                            <Button
                                variant="solid"
                                onClick={() => {
                                    setReason('')
                                    setAction('POST')
                                }}
                            >
                                <HiOutlinePlus className="mr-1.5 h-4 w-4" />
                                Post to GL
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Document number" value={entry.documentNumber ?? '—'} tone="default" />
                <StatCard label="Total debit" value={totalDebit.toFixed(2)} tone="default" />
                <StatCard label="Total credit" value={totalCredit.toFixed(2)} tone="default" />
                <StatCard
                    label="Balanced"
                    value={
                        Math.abs(totalDebit - totalCredit) < 0.0001
                            ? 'Yes'
                            : 'No'
                    }
                    tone={
                        Math.abs(totalDebit - totalCredit) < 0.0001
                            ? 'success'
                            : 'danger'
                    }
                />
            </div>

            <AdaptiveCard className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Journal lines
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr>
                                <th className="pb-2 text-xs font-semibold text-gray-500">
                                    Account
                                </th>
                                <th className="pb-2 text-xs font-semibold text-gray-500">
                                    Debit
                                </th>
                                <th className="pb-2 text-xs font-semibold text-gray-500">
                                    Credit
                                </th>
                                <th className="pb-2 text-xs font-semibold text-gray-500">
                                    Description
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(entry.lines ?? []).map((line) => (
                                <tr key={line.id} className="border-b border-gray-100 dark:border-gray-700/50">
                                    <td className="py-2 text-gray-900 dark:text-gray-100">
                                        {line.glAccountId}
                                    </td>
                                    <td className="py-2 text-gray-900 dark:text-gray-100 font-mono">
                                        {(Number(line.debitAmount) || 0).toFixed(2)}
                                    </td>
                                    <td className="py-2 text-gray-900 dark:text-gray-100 font-mono">
                                        {(Number(line.creditAmount) || 0).toFixed(2)}
                                    </td>
                                    <td className="py-2 text-gray-500 dark:text-gray-300">
                                        {line.description ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </AdaptiveCard>

            <AdaptiveCard>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Audit information
                </h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Posting date
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {formatFicoDate(entry.postingDate)}
                    </dd>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Posted at
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {entry.postedAt ? formatFicoDate(entry.postedAt) : '—'}
                    </dd>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Posted by
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {entry.postedBy ?? '—'}
                    </dd>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Document type
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {entry.documentType}
                    </dd>
                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Currency
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {entry.currencyCode}
                    </dd>
                </dl>
            </AdaptiveCard>

            <ConfirmDialog
                isOpen={Boolean(action)}
                type={
                    action === 'REJECT'
                        ? 'warning'
                        : action === 'POST'
                          ? 'success'
                          : 'info'
                }
                title={
                    action === 'SUBMIT'
                        ? 'Submit for Approval'
                        : action === 'APPROVE'
                          ? 'Approve Journal Entry'
                          : action === 'REJECT'
                            ? 'Reject Journal Entry'
                            : action === 'RESUBMIT'
                              ? 'Resubmit for Approval'
                              : 'Post to General Ledger'
                }
                confirmText={action === 'POST' ? 'Post' : 'Confirm'}
                confirmButtonProps={{ loading: saving }}
                onConfirm={submitAction}
                onCancel={() => {
                    setAction(null)
                    setReason('')
                }}
            >
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {entry.documentNumber ?? '—'} — {entry.description ?? ''}
                    </p>
                    <p className="text-sm text-gray-500">
                        {action === 'SUBMIT'
                            ? 'Submitting sends the entry to an approver.'
                            : action === 'APPROVE'
                              ? 'Approval authorizes posting to the general ledger.'
                              : action === 'REJECT'
                                ? 'Rejection returns the entry to the preparer.'
                                : action === 'RESUBMIT'
                                  ? 'Resubmission places the entry back into the approval queue.'
                                  : 'Posting writes the entry to the general ledger. Posted entries are immutable.'}
                    </p>
                    {(action === 'SUBMIT' ||
                        action === 'APPROVE' ||
                        action === 'REJECT') && (
                        <FormItem label="Reason (optional)">
                            <Input
                                textArea
                                rows={2}
                                maxLength={500}
                                value={reason}
                                placeholder="Explain the action"
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </FormItem>
                    )}
                </div>
            </ConfirmDialog>
        </PageContainer>
    )
}

export default JournalEntryDetailsPage
