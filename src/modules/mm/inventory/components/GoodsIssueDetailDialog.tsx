'use client'

import type { ReactNode } from 'react'
import {
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineLocationMarker,
    HiOutlineLogout,
    HiOutlineShieldCheck,
} from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import Tag from '@/components/ui/Tag'
import { DocStatusBadge } from '../utils/inventoryUi'
import { fmtMoney } from '../../shared/formatters'
import type { GoodsIssue, StockOpsLine } from '../types'

const fmtDateTime = (iso?: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    })
}

const fmtDate = (iso?: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function materialCode(line: StockOpsLine) {
    return (
        line.material?.materialCode ??
        line.material?.code ??
        line.materialId ??
        '—'
    )
}

function materialName(line: StockOpsLine) {
    return (
        line.material?.materialName ??
        line.material?.name ??
        materialCode(line)
    )
}

const MetaItem = ({
    icon,
    label,
    value,
    mono,
}: {
    icon: ReactNode
    label: string
    value: ReactNode
    mono?: boolean
}) => (
    <div className="flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {icon}
        </span>
        <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {label}
            </div>
            <div
                className={
                    mono
                        ? 'mt-0.5 break-all font-mono text-sm font-medium heading-text'
                        : 'mt-0.5 text-sm font-medium heading-text'
                }
            >
                {value}
            </div>
        </div>
    </div>
)

const GiLineRow = ({ line }: { line: StockOpsLine }) => {
    const qty = Number(line.quantity)
    const unit = Number(line.unitCost ?? 0)
    const total = Number(line.totalCost ?? qty * unit)
    const code = materialCode(line)

    return (
        <li className="flex gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 font-mono text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800">
                {code.slice(0, 4)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <span className="font-mono text-xs text-primary">
                            {code}
                        </span>
                        <p className="mt-1 text-sm font-medium leading-snug heading-text">
                            {materialName(line)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            {line.uom?.code ?? '—'}
                            {line.storageBin?.code
                                ? ` · Bin ${line.storageBin.code}`
                                : ''}
                        </p>
                    </div>
                    <div className="shrink-0 text-right">
                        <div className="text-xs text-gray-500">
                            {qty} {line.uom?.code ?? ''}
                            {unit > 0 ? ` @ ${fmtMoney(unit)}` : ''}
                        </div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums">
                            {fmtMoney(total)}
                        </div>
                    </div>
                </div>
            </div>
        </li>
    )
}

type Props = {
    detail: GoodsIssue | null
    isOpen: boolean
    onClose: () => void
    footer?: ReactNode
    atpPreview?: ReactNode
}

const GoodsIssueDetailDialog = ({
    detail,
    isOpen,
    onClose,
    footer,
    atpPreview,
}: Props) => {
    const lines = detail?.lines ?? []
    const lineCount = lines.length
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
    const totalCost = lines.reduce(
        (sum, line) =>
            sum +
            Number(
                line.totalCost ??
                    Number(line.quantity) * Number(line.unitCost ?? 0),
            ),
        0,
    )

    return (
        <Dialog
            isOpen={isOpen}
            width={920}
            contentClassName="flex max-h-[min(92dvh,920px)] flex-col overflow-hidden p-0"
            onClose={onClose}
            onRequestClose={onClose}
        >
            {detail ? (
                <>
                    <header className="shrink-0 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white px-5 py-4 pr-14 dark:border-gray-700 dark:from-gray-900 dark:to-gray-900/80 sm:px-6 sm:pr-16">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-lg text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                                        <HiOutlineLogout />
                                    </span>
                                    <div>
                                        <h4 className="font-mono text-xl font-bold heading-text sm:text-2xl">
                                            {detail.documentNumber}
                                        </h4>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                            <DocStatusBadge
                                                status={detail.status}
                                            />
                                            <Tag className="text-[10px] font-semibold uppercase">
                                                {detail.issuePurpose}
                                            </Tag>
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    Posting {fmtDate(detail.postingDate)}
                                    <span className="mx-1.5 text-gray-300">
                                        ·
                                    </span>
                                    {lineCount}{' '}
                                    {lineCount === 1 ? 'line' : 'lines'}
                                    <span className="mx-1.5 text-gray-300">
                                        ·
                                    </span>
                                    {totalQty}{' '}
                                    {totalQty === 1 ? 'unit' : 'units'}
                                </p>
                            </div>
                            <div className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-right shadow-sm sm:max-w-[min(100%,16rem)] dark:border-gray-700 dark:bg-gray-800/80">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                    Document value
                                </div>
                                <div className="text-2xl font-bold tabular-nums text-primary-deep dark:text-primary-light">
                                    {fmtMoney(totalCost)}
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                        <div className="grid gap-4 lg:grid-cols-3">
                            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    <HiOutlineLocationMarker className="text-base" />
                                    Warehouse
                                </h6>
                                <p className="text-base font-semibold heading-text">
                                    {detail.warehouse?.name ?? '—'}
                                </p>
                                <dl className="mt-3 space-y-2 text-sm">
                                    <div>
                                        <dt className="text-gray-500">
                                            Purpose
                                        </dt>
                                        <dd className="font-medium">
                                            {detail.issuePurpose}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-500">
                                            Source type
                                        </dt>
                                        <dd className="font-medium">
                                            {detail.sourceDocumentType ?? '—'}
                                        </dd>
                                    </div>
                                </dl>
                            </section>

                            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    <HiOutlineCalendar className="text-base" />
                                    Dates
                                </h6>
                                <div className="space-y-3">
                                    <MetaItem
                                        icon={<HiOutlineCalendar />}
                                        label="Posting date"
                                        value={fmtDate(detail.postingDate)}
                                    />
                                    <MetaItem
                                        icon={<HiOutlineClipboardList />}
                                        label="Created"
                                        value={fmtDateTime(detail.createdAt)}
                                    />
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    <HiOutlineShieldCheck className="text-base" />
                                    Verification
                                </h6>
                                <div className="space-y-2 text-sm">
                                    <div>
                                        <dt className="text-gray-500">
                                            Supervisor
                                        </dt>
                                        <dd className="font-medium">
                                            {detail.supervisorVerifiedAt
                                                ? `${detail.supervisorVerifiedBy ?? '—'} · ${fmtDateTime(detail.supervisorVerifiedAt)}`
                                                : 'Pending'}
                                        </dd>
                                    </div>
                                    {detail.verifiedSourceReference ? (
                                        <MetaItem
                                            icon={<HiOutlineDocumentText />}
                                            label="Verified reference"
                                            value={detail.verifiedSourceReference}
                                            mono
                                        />
                                    ) : null}
                                </div>
                            </section>
                        </div>

                        {detail.remarks ? (
                            <section className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                                <h6 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Remarks
                                </h6>
                                <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                                    {detail.remarks}
                                </p>
                            </section>
                        ) : null}

                        {atpPreview ? (
                            <div className="mt-4">{atpPreview}</div>
                        ) : null}

                        <section className="mt-4">
                            <div className="mb-2 flex items-center justify-between">
                                <h6 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Line items
                                </h6>
                                <span className="text-xs text-gray-500">
                                    {lineCount}{' '}
                                    {lineCount === 1 ? 'line' : 'lines'}
                                </span>
                            </div>
                            <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/20">
                                {lines.map((line) => (
                                    <GiLineRow key={line.id} line={line} />
                                ))}
                            </ul>
                        </section>
                    </div>

                    {footer ? (
                        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700 sm:px-6">
                            {footer}
                        </footer>
                    ) : null}
                </>
            ) : null}
        </Dialog>
    )
}

export default GoodsIssueDetailDialog
