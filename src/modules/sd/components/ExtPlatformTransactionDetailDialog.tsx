'use client'

import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import {
    HiOutlineCheck,
    HiOutlineClipboardCheck,
    HiOutlineCreditCard,
    HiOutlineCube,
    HiOutlineDocumentText,
    HiOutlinePencil,
    HiOutlineReceiptTax,
    HiOutlineTrash,
    HiOutlineX,
} from 'react-icons/hi'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import classNames from '@/utils/classNames'
import type { ExtPlatformTransaction } from '../types/extPlatform'
import { formatSdMoney } from './SdDataTableCells'
import { SourceBadge, SourceIcon, TaxClassTag, paymentMethodLabel } from './extPlatformUi'

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
    DRAFT: { label: 'Draft', tone: 'default' },
    CONFIRMED: { label: 'Confirmed', tone: 'info' },
    APPROVED: { label: 'Approved', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

const STEPS = ['DRAFT', 'CONFIRMED', 'APPROVED'] as const

const money = (value: number | string | null | undefined) => formatSdMoney(Number(value ?? 0))
const dateTime = (value?: string | null) => (value ? dayjs(value).format('MMM D, YYYY · h:mm A') : '—')

/** Draft → Confirmed → Approved tracker; a cancelled transaction shows a single red state. */
function StatusTracker({ status }: { status: string }) {
    if (status === 'CANCELLED') {
        return (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <HiOutlineX className="h-4 w-4" /> This transaction was cancelled and is excluded from sales totals.
            </div>
        )
    }
    const current = STEPS.indexOf(status as (typeof STEPS)[number])
    return (
        <ol className="flex items-center gap-2">
            {STEPS.map((step, index) => {
                const done = index < current
                const active = index === current
                return (
                    <li key={step} className="flex flex-1 items-center gap-2">
                        <span
                            className={classNames(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                done && 'bg-emerald-500 text-white',
                                active && 'bg-primary text-white ring-4 ring-primary/15',
                                !done && !active && 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                            )}
                        >
                            {done ? <HiOutlineCheck className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <span
                            className={classNames(
                                'text-xs font-medium',
                                active ? 'heading-text' : 'text-gray-500',
                            )}
                        >
                            {STATUS_META[step].label}
                        </span>
                        {index < STEPS.length - 1 ? (
                            <span
                                className={classNames(
                                    'h-px flex-1',
                                    done ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700',
                                )}
                            />
                        ) : null}
                    </li>
                )
            })}
        </ol>
    )
}

function Panel({
    icon,
    title,
    children,
    className,
}: {
    icon: ReactNode
    title: string
    children: ReactNode
    className?: string
}) {
    return (
        <section
            className={classNames(
                'rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
                className,
            )}
        >
            <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-sm text-primary">
                    {icon}
                </span>
                <h5 className="text-sm font-semibold heading-text">{title}</h5>
            </header>
            <div className="p-4">{children}</div>
        </section>
    )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className="mt-0.5 truncate text-sm heading-text">{children || <span className="text-gray-400">—</span>}</dd>
        </div>
    )
}

function SummaryRow({
    label,
    value,
    muted,
    negative,
}: {
    label: string
    value: number
    muted?: boolean
    negative?: boolean
}) {
    return (
        <div className={classNames('flex items-center justify-between py-1 text-sm', muted && 'text-gray-500')}>
            <span>{label}</span>
            <span className="tabular-nums">
                {negative && value > 0 ? '− ' : ''}
                {money(value)}
            </span>
        </div>
    )
}

export type ExtPlatformTransactionDetailDialogProps = {
    transaction: ExtPlatformTransaction | null
    onClose: () => void
    /** Status actions; omitted actions are hidden. */
    onEdit?: (tx: ExtPlatformTransaction) => void
    onConfirm?: (tx: ExtPlatformTransaction) => void
    onApprove?: (tx: ExtPlatformTransaction) => void
    onDelete?: (tx: ExtPlatformTransaction) => void
}

export default function ExtPlatformTransactionDetailDialog({
    transaction: tx,
    onClose,
    onEdit,
    onConfirm,
    onApprove,
    onDelete,
}: ExtPlatformTransactionDetailDialogProps) {
    if (!tx) return null

    const lines = tx.lines
    const sum = (pick: (line: (typeof lines)[number]) => number | string | null) =>
        lines.reduce((total, line) => total + Number(pick(line) ?? 0), 0)
    const grossSales = sum((l) => Number(l.quantity) * Number(l.unitPrice))
    const vatableSales = sum((l) => l.taxableAmount)
    const exemptSales = sum((l) => l.exemptAmount)
    const zeroRatedSales = sum((l) => l.zeroRatedAmount)
    const nonVatSales = sum((l) => (l.taxClassification ? 0 : l.netAmount))
    const vatRates = [...new Set(lines.filter((l) => l.taxClassification === 'VATABLE' && l.taxRate).map((l) => Number(l.taxRate)))]
    const total = Number(tx.grandTotal)
    const fees = Number(tx.platformFees)
    const status = STATUS_META[tx.status] ?? { label: tx.status, tone: 'default' as StatusTone }
    const isDraft = tx.status === 'DRAFT'

    return (
        <FormDialog
            isOpen
            onClose={onClose}
            width={1120}
            icon={<SourceIcon code={tx.salesSource.code} className="h-5 w-5" />}
            iconClassName="bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-gray-700"
            title={
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{tx.transactionNumber}</span>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </span>
            }
            description={`${tx.salesSource.name} sale · ${dayjs(tx.transactionDate).format('MMMM D, YYYY')} · ${tx.company?.name ?? ''}`}
            headerExtra={<StatusTracker status={tx.status} />}
            bodyClassName="bg-gray-50 dark:bg-gray-900/40"
            footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                        Recorded {dateTime(tx.createdAt)}
                        {tx.approvedAt ? ` · Approved ${dateTime(tx.approvedAt)}` : ''}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {isDraft && onDelete ? (
                            <Button
                                size="sm"
                                variant="plain"
                                icon={<HiOutlineTrash />}
                                className="!text-red-500"
                                onClick={() => onDelete(tx)}
                            >
                                Delete
                            </Button>
                        ) : null}
                        <Button size="sm" onClick={onClose}>
                            Close
                        </Button>
                        {isDraft && onEdit ? (
                            <Button size="sm" icon={<HiOutlinePencil />} onClick={() => onEdit(tx)}>
                                Edit
                            </Button>
                        ) : null}
                        {isDraft && onConfirm ? (
                            <Button size="sm" variant="solid" icon={<HiOutlineClipboardCheck />} onClick={() => onConfirm(tx)}>
                                Confirm
                            </Button>
                        ) : null}
                        {tx.status === 'CONFIRMED' && onApprove ? (
                            <Button size="sm" variant="solid" icon={<HiOutlineCheck />} onClick={() => onApprove(tx)}>
                                Approve
                            </Button>
                        ) : null}
                    </div>
                </div>
            }
        >
            <div className="grid gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                    <Panel icon={<HiOutlineDocumentText />} title="Order details">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                            <Field label="Sales channel">
                                <SourceBadge source={tx.salesSource} />
                            </Field>
                            <Field label="External order ref.">
                                {tx.externalOrderRef ? <span className="font-mono">{tx.externalOrderRef}</span> : null}
                            </Field>
                            <Field label="Store / platform">{tx.externalPlatformName}</Field>
                            <Field label="Transaction date">{dayjs(tx.transactionDate).format('MMM D, YYYY')}</Field>
                            <Field label="Company">{tx.company?.name}</Field>
                            <Field label="Branch">{tx.branch?.name}</Field>
                            <Field label="Customer">
                                {tx.customer?.companyName ?? tx.customerName}
                                {tx.customer?.customerNumber ? (
                                    <span className="ml-1 text-xs text-gray-400">{tx.customer.customerNumber}</span>
                                ) : null}
                            </Field>
                        </dl>
                    </Panel>

                    <Panel icon={<HiOutlineCube />} title={`Products (${lines.length})`}>
                        <div className="-mx-4 -my-4 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-700">
                                        <th className="px-4 py-2.5">Product</th>
                                        <th className="px-3 py-2.5 text-right">Qty</th>
                                        <th className="px-3 py-2.5 text-right">Unit price</th>
                                        <th className="px-3 py-2.5 text-right">Discount</th>
                                        <th className="px-3 py-2.5">Tax</th>
                                        <th className="px-3 py-2.5 text-right">VAT</th>
                                        <th className="px-4 py-2.5 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {lines.map((line) => (
                                        <tr key={line.id} className="align-top">
                                            <td className="max-w-[18rem] px-4 py-3">
                                                <div className="font-medium leading-snug heading-text">
                                                    {line.productName ?? line.materialName ?? line.materialCode}
                                                </div>
                                                {line.variantName ? (
                                                    <div className="text-xs text-gray-500">{line.variantName}</div>
                                                ) : null}
                                                <div className="mt-0.5 font-mono text-[11px] text-gray-400">
                                                    {[line.sku, line.materialCode && `MM ${line.materialCode}`].filter(Boolean).join(' · ')}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">{Number(line.quantity)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                                                {Number(line.discount) ? `− ${money(line.discount)}` : '—'}
                                            </td>
                                            <td className="px-3 py-3">
                                                <TaxClassTag
                                                    classification={line.taxClassification}
                                                    taxCode={line.taxCode}
                                                    taxRate={line.taxRate != null ? Number(line.taxRate) : null}
                                                />
                                                {line.taxCode ? (
                                                    <div className="mt-1 text-[11px] text-gray-400">
                                                        {line.taxCode}
                                                        {line.calculationMethod === 'TAX_INCLUSIVE'
                                                            ? ' · price incl. VAT'
                                                            : line.calculationMethod === 'TAX_EXCLUSIVE'
                                                              ? ' · VAT added'
                                                              : ''}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-3 py-3 text-right tabular-nums">{money(line.taxAmount)}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums heading-text">
                                                {money(line.grossAmount)}
                                                <div className="text-[11px] font-normal text-gray-400">
                                                    Net {money(line.netAmount)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    {tx.remarks ? (
                        <Panel icon={<HiOutlineDocumentText />} title="Remarks">
                            <p className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{tx.remarks}</p>
                        </Panel>
                    ) : null}
                </div>

                <aside className="lg:col-span-4">
                    <div className="space-y-4 lg:sticky lg:top-0">
                        <Panel icon={<HiOutlineReceiptTax />} title="Summary">
                            <SummaryRow label="Gross sales" value={grossSales} />
                            <SummaryRow label="Discounts" value={Number(tx.discountTotal)} negative muted />
                            <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
                            <SummaryRow label="VATable sales" value={vatableSales} muted />
                            <SummaryRow
                                label={`VAT${vatRates.length === 1 ? ` (${vatRates[0]}%)` : ''}`}
                                value={Number(tx.taxTotal)}
                                muted
                            />
                            <SummaryRow label="VAT-exempt sales" value={exemptSales} muted />
                            <SummaryRow label="Zero-rated sales" value={zeroRatedSales} muted />
                            {nonVatSales > 0 ? <SummaryRow label="Non-VAT sales" value={nonVatSales} muted /> : null}
                            <div className="mt-2 flex items-end justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
                                <span className="text-sm font-semibold heading-text">Total amount</span>
                                <span className="text-2xl font-bold tabular-nums heading-text">{money(total)}</span>
                            </div>
                            <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
                                <SummaryRow label="Platform fees" value={fees} negative muted />
                                <div className="flex items-center justify-between pt-1 text-sm font-semibold heading-text">
                                    <span>Expected settlement</span>
                                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{money(total - fees)}</span>
                                </div>
                            </div>
                        </Panel>

                        <Panel icon={<HiOutlineCreditCard />} title="Payment & stock">
                            <dl className="space-y-3">
                                <Field label="Payment method">{tx.paymentMethod ? paymentMethodLabel(tx.paymentMethod) : null}</Field>
                                <Field label="Settlement / payout ref.">
                                    {tx.settlementReference ? <span className="font-mono">{tx.settlementReference}</span> : null}
                                </Field>
                                <Field label="Inventory">
                                    {tx.isCompanyInventory ? 'Company-owned stock' : 'Third-party stock'}
                                </Field>
                            </dl>
                        </Panel>
                    </div>
                </aside>
            </div>
        </FormDialog>
    )
}
