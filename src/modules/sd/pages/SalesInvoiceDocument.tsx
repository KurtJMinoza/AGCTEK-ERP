'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
    HiOutlineDocumentText,
    HiOutlineDownload,
    HiOutlineExternalLink,
    HiOutlineRefresh,
} from 'react-icons/hi'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import Breadcrumb from '@/components/shared/Breadcrumb'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import { type ColumnDef } from '@/components/shared/DataTable'
import SdDataTable from '../components/SdDataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import Loading from '@/components/shared/Loading'
import ErpBackLink from '@/components/erp/ErpBackLink'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    fetchInvoicePdf,
    getInvoice,
    type InvoiceDetail,
    type InvoiceLine,
} from '../services/invoiceService'
import {
    BILLING_ROUTE,
    BILLING_STATUS_META,
    formatDate,
    formatDateTime,
    formatMoney,
    invoiceDocumentHref,
    paymentMethodLabel,
    paymentTone,
    salesOrderHref,
} from '../utils/invoiceDisplay'

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <AdaptiveCard>
        <h6 className="mb-3 text-sm font-semibold heading-text">{title}</h6>
        {children}
    </AdaptiveCard>
)

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
        <span className="shrink-0 text-gray-500">{label}</span>
        <span className="text-right font-medium">{children ?? '—'}</span>
    </div>
)

const SalesInvoiceDocument = () => {
    const params = useParams<{ invoiceId: string }>()
    const invoiceId = params?.invoiceId ?? ''

    const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!invoiceId) return
        setLoading(true)
        setError(null)
        try {
            setInvoice(await getInvoice(invoiceId))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to load the invoice')
        } finally {
            setLoading(false)
        }
    }, [invoiceId])

    useEffect(() => {
        void load()
    }, [load])

    const [downloading, setDownloading] = useState(false)
    const downloadPdf = async () => {
        if (!invoice) return
        setDownloading(true)
        try {
            const url = URL.createObjectURL(await fetchInvoicePdf(invoice.id))
            const link = document.createElement('a')
            link.href = url
            link.download = `${invoice.invoiceNumber}.pdf`
            link.click()
            URL.revokeObjectURL(url)
        } catch (e) {
            toast.push(
                <Notification type="danger" title="Download failed" closable duration={4000}>
                    {e instanceof Error ? e.message : 'Could not download the invoice PDF'}
                </Notification>,
                { placement: 'top-end' },
            )
        } finally {
            setDownloading(false)
        }
    }

    const breadcrumbItems = useMemo(
        () =>
            buildErpBreadcrumbs(invoiceDocumentHref(invoiceId), {
                detailLabel: invoice?.invoiceNumber ?? 'Invoice',
            }),
        [invoiceId, invoice?.invoiceNumber],
    )

    const currency = invoice?.currency ?? 'PHP'

    const lineColumns = useMemo<ColumnDef<InvoiceLine>[]>(
        () => [
            { header: '#', size: 50, cell: ({ row }) => row.original.lineNumber },
            {
                header: 'SKU',
                cell: ({ row }) => <span className="font-mono">{row.original.sku || '—'}</span>,
            },
            {
                header: 'Description',
                cell: ({ row }) =>
                    [row.original.description, row.original.variantName]
                        .filter(Boolean)
                        .join(' — ') || '—',
            },
            {
                header: 'Qty',
                size: 70,
                cell: ({ row }) => (
                    <span className="tabular-nums">{Number(row.original.quantity)}</span>
                ),
            },
            {
                header: 'Unit price',
                cell: ({ row }) => (
                    <span className="tabular-nums">
                        {formatMoney(row.original.unitPrice, currency)}
                    </span>
                ),
            },
            {
                header: 'Amount',
                cell: ({ row }) => (
                    <span className="font-semibold tabular-nums">
                        {formatMoney(row.original.lineTotal, currency)}
                    </span>
                ),
            },
        ],
        [currency],
    )

    if (loading && !invoice) {
        return (
            <PageContainer>
                <Loading loading className="min-h-[50vh]" />
            </PageContainer>
        )
    }

    if (!invoice) {
        return (
            <PageContainer>
                <Breadcrumb items={breadcrumbItems} />
                <ErpBackLink items={breadcrumbItems} />
                <Alert showIcon type="danger" className="mt-4">
                    {error ?? 'Invoice not found.'}
                </Alert>
                <div className="mt-4 flex gap-2">
                    <Button size="sm" icon={<HiOutlineRefresh />} onClick={() => void load()}>
                        Retry
                    </Button>
                    <Link href={BILLING_ROUTE}>
                        <Button size="sm">Back to Billing</Button>
                    </Link>
                </div>
            </PageContainer>
        )
    }

    const order = invoice.salesOrder
    const company = order.company
    const statusMeta = BILLING_STATUS_META[invoice.billingStatus]
    const shipToLines = [
        order.shipToName,
        order.shipToPhone,
        order.shipToAddressLine1,
        [order.shipToCity, order.shipToRegion, order.shipToPostalCode]
            .filter(Boolean)
            .join(', '),
        order.shipToCountry,
    ].filter(Boolean) as string[]

    const totals: Array<[string, number]> = [
        ['Subtotal', Number(invoice.subtotal)],
        ['Discount', -Number(invoice.discountAmount)],
        ['Shipping', Number(invoice.shippingAmount)],
    ]

    return (
        <PageContainer>
            <Breadcrumb items={breadcrumbItems} />
            <ErpBackLink items={breadcrumbItems} />
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span className="font-mono">{invoice.invoiceNumber}</span>
                        <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                        {order.paymentStatus ? (
                            <StatusBadge tone={paymentTone(order.paymentStatus)}>
                                {order.paymentStatus}
                            </StatusBadge>
                        ) : null}
                    </span>
                }
                description={`Sales invoice · ${company?.name ?? 'No company'}`}
                icon={<HiOutlineDocumentText />}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={() => void load()}
                        >
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            icon={<HiOutlineDownload />}
                            loading={downloading}
                            onClick={() => void downloadPdf()}
                        >
                            Download PDF
                        </Button>
                        <Link href={salesOrderHref(order.orderNumber)}>
                            <Button size="sm" variant="solid" icon={<HiOutlineExternalLink />}>
                                Open sales order
                            </Button>
                        </Link>
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                    <AdaptiveCard>
                        <div className="flex flex-col gap-6 border-b border-gray-200 pb-5 sm:flex-row sm:justify-between dark:border-gray-600">
                            <div>
                                <p className="text-lg font-bold heading-text">
                                    {company?.name ?? '—'}
                                </p>
                                {company?.address ? (
                                    <p className="mt-1 text-sm text-gray-500">{company.address}</p>
                                ) : null}
                                {company?.tin ? (
                                    <p className="text-sm text-gray-500">TIN {company.tin}</p>
                                ) : null}
                            </div>
                            <div className="sm:text-right">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Sales invoice
                                </p>
                                <p className="font-mono text-lg font-bold">
                                    {invoice.invoiceNumber}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {formatDateTime(invoice.issuedAt) ?? 'Not posted yet'}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 py-5 sm:grid-cols-2">
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Bill to
                                </p>
                                <p className="font-semibold">{invoice.billTo.name ?? '—'}</p>
                                {invoice.billTo.customerNumber ? (
                                    <p className="text-sm text-gray-500">
                                        {invoice.billTo.customerNumber}
                                    </p>
                                ) : null}
                                {invoice.billTo.email ? (
                                    <p className="text-sm text-gray-500">{invoice.billTo.email}</p>
                                ) : null}
                            </div>
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Ship to
                                </p>
                                {shipToLines.length ? (
                                    shipToLines.map((line, i) => (
                                        <p
                                            key={i}
                                            className={i === 0 ? 'font-semibold' : 'text-sm text-gray-500'}
                                        >
                                            {line}
                                        </p>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-400">No delivery address</p>
                                )}
                            </div>
                        </div>

                        <SdDataTable
                            columns={lineColumns}
                            data={invoice.lines ?? []}
                            compact
                            fit
                            hidePagination
                            noData={(invoice.lines ?? []).length === 0}
                        />

                        <div className="ml-auto mt-5 w-full max-w-xs space-y-1 text-sm">
                            {totals.map(([label, amount]) => (
                                <div key={label} className="flex justify-between">
                                    <span className="text-gray-500">{label}</span>
                                    <span className="tabular-nums">{formatMoney(amount, currency)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold dark:border-gray-600">
                                <span>Total</span>
                                <span className="tabular-nums">
                                    {formatMoney(invoice.totalAmount, currency)}
                                </span>
                            </div>
                            {Number(invoice.refundedAmount) > 0 ? (
                                <div className="flex justify-between text-amber-600">
                                    <span>Refunded</span>
                                    <span className="tabular-nums">
                                        {formatMoney(invoice.refundedAmount, currency)}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        {invoice.notes ? (
                            <div className="mt-5 border-t border-gray-200 pt-4 text-sm dark:border-gray-600">
                                <p className="text-xs text-gray-500">Notes</p>
                                <p className="mt-0.5">{invoice.notes}</p>
                            </div>
                        ) : null}
                    </AdaptiveCard>
                </div>

                <div className="space-y-4">
                    <Section title="References">
                        <Field label="Sales order">
                            <Link
                                href={salesOrderHref(order.orderNumber)}
                                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                            >
                                {order.orderNumber}
                                <HiOutlineExternalLink />
                            </Link>
                        </Field>
                        <Field label="Channel">{order.channel}</Field>
                        <Field label="Order status">{order.status}</Field>
                    </Section>

                    <Section title="Payment">
                        <Field label="Method">{paymentMethodLabel(order.paymentMethod)}</Field>
                        <Field label="Status">
                            {order.paymentStatus ? (
                                <StatusBadge tone={paymentTone(order.paymentStatus)}>
                                    {order.paymentStatus}
                                </StatusBadge>
                            ) : null}
                        </Field>
                        <Field label="Reference">{order.paymentReference}</Field>
                        {order.isDemoPayment ? (
                            <p className="mt-2 text-xs text-amber-600">
                                Demo payment — no real gateway was charged.
                            </p>
                        ) : null}
                    </Section>

                    <Section title="Dates">
                        <Field label="Created">{formatDateTime(invoice.createdAt)}</Field>
                        <Field label="Posted">{formatDateTime(invoice.issuedAt)}</Field>
                        <Field label="Due">{formatDate(invoice.dueDate)}</Field>
                        <Field label="Shipped">{formatDateTime(order.shippedAt)}</Field>
                        <Field label="Delivered">{formatDateTime(order.deliveredAt)}</Field>
                        <Field label="Paid">{formatDateTime(invoice.paidAt)}</Field>
                        {invoice.cancelledAt ? (
                            <Field label="Cancelled">{formatDateTime(invoice.cancelledAt)}</Field>
                        ) : null}
                    </Section>
                </div>
            </div>
        </PageContainer>
    )
}

export default SalesInvoiceDocument
