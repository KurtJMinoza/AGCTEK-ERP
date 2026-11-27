'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    HiOutlineArrowLeft,
    HiOutlineCalendar,
    HiOutlineCash,
    HiOutlineDocumentText,
    HiOutlineRefresh,
} from 'react-icons/hi'
import {
    notifyError,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import {
    ArAgingBucketBadge,
    ArOpenItemStatus,
    formatArDate,
    formatArMoney,
} from '../components/accountsReceivable/arUi'
import { FicoTwoLineCell } from '../components/ficoTableUi'
import { ficoAccountsReceivableService } from '../services/ficoService'
import type { FicoArDocumentDetail } from '../types'

const LIST_ROUTE = '/modules/fico/accounts-receivable'

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {value}
            </dd>
        </div>
    )
}

const AccountsReceivableDetailPage = () => {
    const params = useParams()
    const router = useRouter()
    const idParam = params?.id
    const documentId = Array.isArray(idParam) ? idParam[0] : idParam
    const { companyId, rows } = useFicoCompanies()
    const [document, setDocument] = useState<FicoArDocumentDetail | null>(null)
    const [loading, setLoading] = useState(true)

    const companyLabel = useMemo(() => {
        const row = rows.find((r) => r.company.id === companyId)
        return row?.company.name ?? row?.company.code
    }, [rows, companyId])

    const load = useCallback(() => {
        if (!documentId || !companyId) return
        setLoading(true)
        ficoAccountsReceivableService
            .getDocument(documentId, companyId)
            .then(setDocument)
            .catch((error) => notifyError(error, 'Unable to load AR document.'))
            .finally(() => setLoading(false))
    }, [documentId, companyId])

    useEffect(() => {
        load()
    }, [load])

    const agingBucket =
        document?.agingBucket ?? document?.aging?.bucket ?? undefined
    const openAmount = document?.openItem?.openAmount ?? '0'
    const route = documentId ? `${LIST_ROUTE}/${documentId}` : LIST_ROUTE

    return (
        <PageContainer>
            <PageHeader
                title={
                    document?.referenceNumber ??
                    document?.sourceSalesInvoice?.invoiceNumber ??
                    'AR document'
                }
                description="Customer receivable document — amounts, aging, and links to the SD invoice and FICO journals."
                breadcrumbs={buildErpBreadcrumbs(LIST_ROUTE, [
                    {
                        label:
                            document?.referenceNumber ??
                            document?.sourceSalesInvoice?.invoiceNumber ??
                            'Details',
                        href: route,
                    },
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
                        <Button
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                    </div>
                }
            />

            {loading && !document ? (
                <AdaptiveCard>
                    <Skeleton className="mb-4 h-24" />
                    <Skeleton className="h-64" />
                </AdaptiveCard>
            ) : document ? (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard
                            label="Receivable"
                            value={formatArMoney(
                                document.currencyCode,
                                document.receivableAmount,
                            )}
                            icon={<HiOutlineCash />}
                        />
                        <StatCard
                            label="Open amount"
                            value={formatArMoney(document.currencyCode, openAmount)}
                            icon={<HiOutlineDocumentText />}
                            tone={
                                document.openItem?.status === 'CLEARED'
                                    ? 'success'
                                    : 'warning'
                            }
                        />
                        <StatCard
                            label="Due date"
                            value={formatArDate(document.dueDate)}
                            icon={<HiOutlineCalendar />}
                        />
                        <StatCard
                            label="Aging"
                            value={
                                <ArAgingBucketBadge bucket={agingBucket} />
                            }
                        />
                    </div>

                    <AdaptiveCard className="mb-4">
                        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
                            <ArOpenItemStatus
                                status={document.openItem?.status ?? document.status}
                            />
                            <span className="text-sm text-gray-500">
                                {document.documentType.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <MetaItem label="Company" value={companyLabel ?? document.companyId} />
                            <MetaItem
                                label="Customer"
                                value={
                                    document.customer ? (
                                        <FicoTwoLineCell
                                            primary={document.customer.customerNumber}
                                            secondary={document.customer.companyName}
                                            mono
                                        />
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                            <MetaItem
                                label="SD invoice"
                                value={
                                    document.sourceSalesInvoice ? (
                                        <Link
                                            href={`/modules/sd/billing/${document.sourceSalesInvoice.id}`}
                                            className="text-primary hover:underline"
                                        >
                                            {document.sourceSalesInvoice.invoiceNumber}
                                        </Link>
                                    ) : (
                                        document.referenceNumber ?? '—'
                                    )
                                }
                            />
                            <MetaItem
                                label="Issue journal"
                                value={
                                    document.journalEntry ? (
                                        <Link
                                            href={`/modules/fico/journal-entries/${document.journalEntry.id}`}
                                            className="text-primary hover:underline"
                                        >
                                            {document.journalEntry.documentNumber ??
                                                document.journalEntry.id}
                                        </Link>
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                            <MetaItem
                                label="Clearing journal"
                                value={
                                    document.clearingJournalEntry ? (
                                        <Link
                                            href={`/modules/fico/journal-entries/${document.clearingJournalEntry.id}`}
                                            className="text-primary hover:underline"
                                        >
                                            {document.clearingJournalEntry.documentNumber ??
                                                document.clearingJournalEntry.id}
                                        </Link>
                                    ) : (
                                        'Not cleared'
                                    )
                                }
                            />
                            <MetaItem
                                label="Reconciliation account"
                                value={
                                    document.reconciliationAccount
                                        ? `${document.reconciliationAccount.accountCode} · ${document.reconciliationAccount.accountName}`
                                        : document.reconciliationAccountCode ?? '—'
                                }
                            />
                            <MetaItem
                                label="Posting date"
                                value={formatArDate(document.postingDate)}
                            />
                            <MetaItem
                                label="Baseline date"
                                value={formatArDate(document.baselineDate)}
                            />
                            <MetaItem
                                label="Gross / tax / net"
                                value={`${formatArMoney(document.currencyCode, document.grossAmount)} · tax ${formatArMoney(document.currencyCode, document.taxAmount)} · net ${formatArMoney(document.currencyCode, document.netAmount)}`}
                            />
                        </dl>
                    </AdaptiveCard>

                    {document.journalEntry?.lines?.length ? (
                        <AdaptiveCard>
                            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                                Issue journal lines
                            </h3>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                {document.journalEntry.lines.map((line) => (
                                    <li
                                        key={line.id}
                                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                                    >
                                        <span>
                                            {line.glAccount?.accountCode ?? '—'}{' '}
                                            <span className="text-gray-500">
                                                {line.glAccount?.accountName}
                                            </span>
                                        </span>
                                        <span className="tabular-nums">
                                            Dr {formatArMoney(document.currencyCode, line.debitAmount)}{' '}
                                            · Cr{' '}
                                            {formatArMoney(
                                                document.currencyCode,
                                                line.creditAmount,
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </AdaptiveCard>
                    ) : null}
                </>
            ) : (
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        AR document not found or company not selected.
                    </p>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default AccountsReceivableDetailPage
