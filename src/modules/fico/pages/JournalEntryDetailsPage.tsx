'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import { FormItem } from '@/components/ui/Form'
import Skeleton from '@/components/ui/Skeleton'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineCheck,
    HiOutlinePencil,
    HiOutlineRefresh,
    HiOutlineTrash,
} from 'react-icons/hi'
import {
    notifyError,
    notifySuccess,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import JournalEntryDetailView from '../components/journal/JournalEntryDetailView'
import {
    ficoErrorMessage,
    ficoJournalService,
} from '../services/ficoService'
import type { FicoAuditEntry, FicoJournalEntryDetail } from '../types'

const LIST_ROUTE = '/modules/fico/journal-entries'

const JournalEntryDetailsPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const entryId = Array.isArray(idParam) ? idParam[0] : idParam
    const { companyId, rows } = useFicoCompanies()
    const [entry, setEntry] = useState<FicoJournalEntryDetail | null>(null)
    const [history, setHistory] = useState<FicoAuditEntry[]>([])
    const [reverseOpen, setReverseOpen] = useState(false)
    const [reverseReason, setReverseReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)

    const companyLabel = useMemo(() => {
        const row = rows.find((r) => r.company.id === companyId)
        return row?.company.name ?? row?.company.code
    }, [rows, companyId])

    const load = useCallback(() => {
        if (!entryId || !companyId) return
        setLoading(true)
        Promise.all([
            ficoJournalService.get(entryId, companyId),
            ficoJournalService.approvalHistory(entryId, companyId),
        ])
            .then(([detail, audit]) => {
                setEntry(detail)
                const legacyApproval = new Set([
                    'JOURNAL_SUBMIT',
                    'JOURNAL_APPROVE',
                    'JOURNAL_REJECT',
                    'JOURNAL_RESUBMIT',
                ])
                setHistory(
                    audit.filter((item) => !legacyApproval.has(item.action)),
                )
            })
            .catch((error) =>
                notifyError(error, 'Unable to load journal entry.'),
            )
            .finally(() => setLoading(false))
    }, [entryId, companyId])

    useEffect(() => {
        load()
    }, [load])

    const run = async (action: () => Promise<unknown>, success: string) => {
        setBusy(true)
        try {
            await action()
            notifySuccess(success)
            load()
        } catch (error) {
            notifyError(error, ficoErrorMessage(error, 'Action failed.'))
        } finally {
            setBusy(false)
        }
    }

    const caps = entry?.capabilities
    const canEdit = caps?.canEdit ?? entry?.status === 'DRAFT'
    const canPost = caps?.canPost ?? entry?.status === 'DRAFT'
    const canReverse = caps?.canReverse ?? entry?.status === 'POSTED'
    const readOnlyPosted = caps?.readOnlyPosted ?? (entry?.status === 'POSTED' && Boolean(entry?.sourceModule))

    const route = entryId
        ? `/modules/fico/journal-entries/${entryId}`
        : LIST_ROUTE

    return (
        <PageContainer>
            <PageHeader
                title={
                    entry?.documentNumber
                        ? entry.documentNumber
                        : 'Journal entry'
                }
                description={
                    entry?.description ??
                    'General ledger document — overview, lines, and audit trail.'
                }
                breadcrumbs={buildErpBreadcrumbs(LIST_ROUTE, [
                    { label: entry?.documentNumber ?? 'Details', href: route },
                ])}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="plain"
                            icon={<HiOutlineArrowLeft />}
                            onClick={() => router.push(LIST_ROUTE)}
                        >
                            Back
                        </Button>
                        {canEdit ? (
                            <Link href={`${route}/edit`}>
                                <Button icon={<HiOutlinePencil />}>Edit draft</Button>
                            </Link>
                        ) : null}
                        {canPost ? (
                            <Button
                                variant="solid"
                                icon={<HiOutlineCheck />}
                                loading={busy}
                                onClick={() =>
                                    run(
                                        () => ficoJournalService.post(entryId!),
                                        'Posted to the general ledger.',
                                    )
                                }
                            >
                                Post
                            </Button>
                        ) : null}
                        {canReverse ? (
                            <Button
                                variant="twoTone"
                                icon={<HiOutlineRefresh />}
                                loading={busy}
                                onClick={() => setReverseOpen(true)}
                            >
                                Reverse
                            </Button>
                        ) : null}
                        {readOnlyPosted ? (
                            <span className="text-xs text-gray-500">
                                Posted automatic journal — read-only. Reverse from the source module when required.
                            </span>
                        ) : null}
                        {entry?.status === 'DRAFT' ? (
                            <Button
                                variant="plain"
                                icon={<HiOutlineTrash />}
                                loading={busy}
                                onClick={() =>
                                    run(
                                        () =>
                                            ficoJournalService.cancel(entryId!, {
                                                companyId,
                                            }),
                                        'Draft cancelled.',
                                    )
                                }
                            >
                                Cancel
                            </Button>
                        ) : null}
                    </div>
                }
            />

            {loading && !entry ? (
                <AdaptiveCard>
                    <Skeleton className="mb-4 h-24" />
                    <Skeleton className="h-64" />
                </AdaptiveCard>
            ) : entry ? (
                <JournalEntryDetailView
                    entry={entry}
                    companyLabel={companyLabel}
                    audit={history}
                />
            ) : (
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        Journal not found or company not selected.
                    </p>
                </AdaptiveCard>
            )}

            <Dialog isOpen={reverseOpen} onClose={() => setReverseOpen(false)}>
                <h4 className="mb-1 text-lg font-semibold">Reverse posted journal</h4>
                <p className="mb-4 text-sm text-gray-500">
                    Creates an offsetting entry. Reason is stored in the audit trail.
                </p>
                <FormItem label="Reason (required)">
                    <Input
                        value={reverseReason}
                        placeholder="e.g. POS sale void · correction"
                        onChange={(e) => setReverseReason(e.target.value)}
                    />
                </FormItem>
                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="plain" onClick={() => setReverseOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        disabled={reverseReason.trim().length < 3 || busy}
                        loading={busy}
                        onClick={() =>
                            run(
                                async () => {
                                    await ficoJournalService.reverse(entryId!, {
                                        companyId,
                                        reason: reverseReason,
                                        postingDate: new Date()
                                            .toISOString()
                                            .slice(0, 10),
                                    })
                                    setReverseOpen(false)
                                    setReverseReason('')
                                },
                                'Reversal posted.',
                            )
                        }
                    >
                        Post reversal
                    </Button>
                </div>
            </Dialog>
        </PageContainer>
    )
}

export default JournalEntryDetailsPage