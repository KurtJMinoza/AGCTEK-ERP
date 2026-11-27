'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { formatFicoDate } from '../components/ficoTableUi'
import { formatMoney } from '../components/journal/journalUi'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { accountsPayableService } from '../services/accountsPayableService'
import { apAmount } from '../components/ap/apUtils'

const LIST_ROUTE = '/modules/fico/accounts-payable'

const AccountsPayableDocumentPage = () => {
    const params = useParams()
    const searchParams = useSearchParams()
    const documentId = String(params?.id ?? '')
    const queryCompanyId = searchParams.get('companyId') ?? ''

    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()

    const effectiveCompanyId = queryCompanyId || companyId

    const [doc, setDoc] = useState<Record<string, unknown> | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (queryCompanyId && queryCompanyId !== companyId) {
            setCompanyId(queryCompanyId)
        }
    }, [queryCompanyId, companyId, setCompanyId])

    useEffect(() => {
        if (!documentId || !effectiveCompanyId) return
        setLoading(true)
        setError('')
        accountsPayableService
            .fetchDocument(documentId, effectiveCompanyId)
            .then((row) => setDoc(row as Record<string, unknown>))
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [documentId, effectiveCompanyId])

    const route = `${LIST_ROUTE}/documents/${documentId}`
    const supplier = doc?.supplier as { supplierName?: string; supplierCode?: string } | undefined
    const journal = doc?.journalEntry as { id?: string; documentNumber?: string; status?: string } | undefined
    const openItem = doc?.openItem as {
        openAmount?: number | string
        status?: string
        paymentBlocked?: boolean
        dueDate?: string | null
    } | undefined
    const invoice = doc?.sourceSupplierInvoice as { id?: string; invoiceNumber?: string } | undefined
    const currency = String(doc?.currencyCode ?? 'PHP')

    return (
        <PageContainer>
            <PageHeader
                title="AP document"
                description={doc?.referenceNumber ? String(doc.referenceNumber) : documentId}
                breadcrumbs={buildErpBreadcrumbs(route, {
                    detailLabel: doc?.referenceNumber
                        ? String(doc.referenceNumber)
                        : 'Document',
                })}
                actions={
                    <div className="flex items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={effectiveCompanyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <Link
                            href={LIST_ROUTE}
                            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200"
                        >
                            Back to AP
                        </Link>
                    </div>
                }
            />
            {!effectiveCompanyId ? (
                <p className="text-sm text-gray-500">Select a company.</p>
            ) : loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : doc ? (
                <AdaptiveCard className="space-y-4 p-4">
                    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                        <div>
                            <dt className="text-xs text-gray-400">Supplier</dt>
                            <dd className="font-medium">
                                {supplier?.supplierName}{' '}
                                {supplier?.supplierCode ? `(${supplier.supplierCode})` : null}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-400">Type / status</dt>
                            <dd>
                                {String(doc.documentType)} · {String(doc.status)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-400">Posted</dt>
                            <dd>{formatFicoDate(String(doc.postingDate))}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-400">Gross amount</dt>
                            <dd className="tabular-nums font-semibold">
                                {formatMoney(currency, String(apAmount(doc.grossAmount as string | number)))}
                            </dd>
                        </div>
                        {openItem ? (
                            <div>
                                <dt className="text-xs text-gray-400">Open item</dt>
                                <dd className="tabular-nums">
                                    {openItem.status} ·{' '}
                                    {formatMoney(currency, String(apAmount(openItem.openAmount)))}
                                    {openItem.dueDate
                                        ? ` · due ${formatFicoDate(openItem.dueDate)}`
                                        : null}
                                    {openItem.paymentBlocked ? ' · payment blocked' : null}
                                </dd>
                            </div>
                        ) : null}
                        {journal?.id ? (
                            <div>
                                <dt className="text-xs text-gray-400">Journal</dt>
                                <dd>
                                    <Link
                                        className="font-mono text-primary hover:underline"
                                        href={`/modules/fico/journal-entries/${journal.id}`}
                                    >
                                        {journal.documentNumber} ({journal.status})
                                    </Link>
                                </dd>
                            </div>
                        ) : null}
                        {invoice?.id ? (
                            <div>
                                <dt className="text-xs text-gray-400">MM supplier invoice</dt>
                                <dd>
                                    <Link
                                        className="text-primary hover:underline"
                                        href="/modules/mm/procurement/three-way-match"
                                    >
                                        {invoice.invoiceNumber ?? invoice.id}
                                    </Link>
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </AdaptiveCard>
            ) : null}
        </PageContainer>
    )
}

export default AccountsPayableDocumentPage