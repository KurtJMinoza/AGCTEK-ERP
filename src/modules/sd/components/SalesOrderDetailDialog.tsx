'use client'

import type { ReactNode } from 'react'
import {
    HiOutlineCalendar,
    HiOutlineCreditCard,
    HiOutlineLocationMarker,
    HiOutlineOfficeBuilding,
    HiOutlineReceiptTax,
    HiOutlineShoppingBag,
    HiOutlineUser,
} from 'react-icons/hi'
import Dialog from '@/components/ui/Dialog'
import Tag from '@/components/ui/Tag'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    PAYMENT_METHOD_LABEL,
    type SalesOrderRecord,
} from '../services/salesOrderDashboardService'
import {
    isCommercialResolutionBlocked,
    RESOLUTION_LABEL,
    RESOLUTION_TONE,
} from '../services/customerReturnRequestService'
import {
    formatOrderDateTime,
    formatOrderPrice,
    orderItemCount,
    SalesOrderChannelBadge,
    SalesOrderStatusBadge,
} from './salesOrderPresentation'

type Line = SalesOrderRecord['lines'][number]

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

const OrderLineRow = ({ line }: { line: Line }) => (
    <li className="flex gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            {line.productImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={line.productImage}
                    alt=""
                    className="h-full w-full object-cover"
                />
            ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-gray-400">
                    {line.name.trim().slice(0, 2) || '—'}
                </span>
            )}
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="font-mono text-xs text-primary">
                        {line.sku}
                    </span>
                    <p className="mt-1 text-sm font-medium leading-snug heading-text">
                        {line.name}
                    </p>
                    {line.variantName ? (
                        <Tag className="mt-1 text-[10px]">{line.variantName}</Tag>
                    ) : null}
                    {line.variantBarcode ? (
                        <p className="mt-1 font-mono text-[11px] text-gray-500">
                            {line.variantBarcode}
                        </p>
                    ) : null}
                </div>
                <div className="shrink-0 text-right">
                    <div className="text-xs text-gray-500">
                        {line.quantity} × {formatOrderPrice(line.unitPrice)}
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums">
                        {formatOrderPrice(line.lineTotal)}
                    </div>
                </div>
            </div>
        </div>
    </li>
)

type Props = {
    order: SalesOrderRecord | null
    branchName: string
    isOpen: boolean
    onClose: () => void
    footer?: ReactNode
}

const SalesOrderDetailDialog = ({
    order,
    branchName,
    isOpen,
    onClose,
    footer,
}: Props) => {
    if (!order) {
        return (
            <Dialog
                isOpen={isOpen}
                width={920}
                onClose={onClose}
                onRequestClose={onClose}
            />
        )
    }

    const items = orderItemCount(order)
    const paidTone =
        order.payment?.status === 'Paid'
            ? 'success'
            : order.payment?.status === 'Failed'
              ? 'danger'
              : 'warning'

    return (
        <Dialog
            isOpen={isOpen}
            width={920}
            contentClassName="flex max-h-[min(92dvh,920px)] flex-col overflow-hidden p-0"
            onClose={onClose}
            onRequestClose={onClose}
        >
            <header className="shrink-0 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white px-5 py-4 pr-14 dark:border-gray-700 dark:from-gray-900 dark:to-gray-900/80 sm:px-6 sm:pr-16">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-subtle text-lg text-primary-deep dark:bg-primary/15">
                                <HiOutlineReceiptTax />
                            </span>
                            <div>
                                <h4 className="font-mono text-xl font-bold heading-text sm:text-2xl">
                                    {order.orderId}
                                </h4>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <SalesOrderChannelBadge
                                        channel={order.channel}
                                    />
                                    <SalesOrderStatusBadge
                                        status={order.status}
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {formatOrderDateTime(order.createdAt)}
                            <span className="mx-1.5 text-gray-300">·</span>
                            {order.lines.length}{' '}
                            {order.lines.length === 1 ? 'line' : 'lines'}
                            <span className="mx-1.5 text-gray-300">·</span>
                            {items} {items === 1 ? 'item' : 'items'}
                        </p>
                    </div>
                    <div className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-right shadow-sm sm:max-w-[min(100%,16rem)] dark:border-gray-700 dark:bg-gray-800/80">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                            Order total
                        </div>
                        <div className="text-2xl font-bold tabular-nums text-primary-deep dark:text-primary-light">
                            {formatOrderPrice(order.totalAmount)}
                        </div>
                    </div>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                <div className="grid gap-4 lg:grid-cols-3">
                    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                        <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <HiOutlineUser className="text-base" />
                            Customer
                        </h6>
                        <p className="text-base font-semibold heading-text">
                            {order.customer.name}
                        </p>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div>
                                <dt className="text-gray-500">Email</dt>
                                <dd className="truncate font-medium">
                                    {order.customer.email ?? '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Company</dt>
                                <dd className="font-medium">
                                    {order.company?.name ?? '—'}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                        <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <HiOutlineShoppingBag className="text-base" />
                            Order context
                        </h6>
                        <div className="space-y-3">
                            <MetaItem
                                icon={<HiOutlineLocationMarker />}
                                label="Branch"
                                value={branchName}
                            />
                            <MetaItem
                                icon={<HiOutlineOfficeBuilding />}
                                label="Channel"
                                value={order.channel}
                            />
                            <MetaItem
                                icon={<HiOutlineCalendar />}
                                label="Created"
                                value={formatOrderDateTime(order.createdAt)}
                            />
                        </div>
                    </section>

                    {order.payment ? (
                        <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
                            <h6 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                <HiOutlineCreditCard className="text-base" />
                                Payment
                            </h6>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-gray-500">Method</span>
                                    <span className="flex items-center gap-2 font-semibold">
                                        {order.payment.method &&
                                        order.payment.method in
                                            PAYMENT_METHOD_LABEL
                                            ? PAYMENT_METHOD_LABEL[
                                                  order.payment
                                                      .method as keyof typeof PAYMENT_METHOD_LABEL
                                              ]
                                            : order.payment.method}
                                        {order.payment.isDemo ? (
                                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500 dark:bg-gray-800">
                                                Demo
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-gray-500">Status</span>
                                    <StatusBadge tone={paidTone}>
                                        {order.payment.status ?? '—'}
                                    </StatusBadge>
                                </div>
                                {order.paymentReceived !== null ? (
                                    <>
                                        <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
                                            <span className="text-gray-500">
                                                Tendered
                                            </span>
                                            <span className="font-semibold tabular-nums">
                                                {formatOrderPrice(
                                                    order.paymentReceived,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">
                                                Change
                                            </span>
                                            <span className="font-semibold tabular-nums">
                                                {formatOrderPrice(
                                                    order.change ?? 0,
                                                )}
                                            </span>
                                        </div>
                                    </>
                                ) : null}
                                {order.payment.reference ? (
                                    <p className="font-mono text-xs text-gray-500">
                                        Ref: {order.payment.reference}
                                    </p>
                                ) : null}
                                {(() => {
                                    const open = order.customerReturns?.find(
                                        (r) =>
                                            !isCommercialResolutionBlocked(
                                                r.refundStatus,
                                            ) &&
                                            (r.preferredResolution ===
                                                'REFUND' ||
                                                r.preferredResolution ===
                                                    'REPLACEMENT'),
                                    )
                                    const res = open?.preferredResolution
                                    if (!res) return null
                                    return (
                                        <div className="flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
                                            <span className="text-gray-500">
                                                Customer return
                                            </span>
                                            <StatusBadge
                                                tone={
                                                    RESOLUTION_TONE[res] ??
                                                    'default'
                                                }
                                            >
                                                {RESOLUTION_LABEL[res] ?? res}
                                            </StatusBadge>
                                        </div>
                                    )
                                })()}
                            </div>
                        </section>
                    ) : (
                        <section className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700">
                            No payment record
                        </section>
                    )}
                </div>

                <section className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                        <h6 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Line items
                        </h6>
                        <span className="text-xs text-gray-500">
                            {items} {items === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                    <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/20">
                        {order.lines.map((line) => (
                            <OrderLineRow key={line.lineId} line={line} />
                        ))}
                    </ul>
                </section>

                <section className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
                    <h6 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Summary
                    </h6>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-500">Subtotal</dt>
                            <dd className="tabular-nums font-medium">
                                {formatOrderPrice(order.subtotal)}
                            </dd>
                        </div>
                        {order.promoCode ? (
                            <div className="flex justify-between text-emerald-600">
                                <dt>Promo ({order.promoCode})</dt>
                                <dd className="tabular-nums">
                                    −{formatOrderPrice(order.discountAmount)}
                                </dd>
                            </div>
                        ) : null}
                        {order.channel === 'E-commerce' ? (
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Shipping</dt>
                                <dd className="tabular-nums">
                                    {formatOrderPrice(order.shipping)}
                                </dd>
                            </div>
                        ) : null}
                        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold dark:border-gray-700">
                            <dt>Total</dt>
                            <dd className="tabular-nums text-primary-deep dark:text-primary-light">
                                {formatOrderPrice(order.totalAmount)}
                            </dd>
                        </div>
                    </dl>
                </section>
            </div>

            {footer ? (
                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700 sm:px-6">
                    {footer}
                </footer>
            ) : null}
        </Dialog>
    )
}

export default SalesOrderDetailDialog
