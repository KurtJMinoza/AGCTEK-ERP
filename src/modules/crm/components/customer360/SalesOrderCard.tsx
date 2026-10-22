'use client'

import { useState } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { SD_SALES_ORDERS_PATH } from '../OpportunitySalesOrderDialog'
import { opportunityHref } from '../../utils/deepLinks'
import { formatDate, formatEnumLabel, formatMoney } from '../../utils/format'
import { ORDER_STATUS_TONE } from './statusTones'
import type { Customer360Order } from '../../types'

const total = (order: Customer360Order) =>
    formatMoney(order.totalAmount === null ? null : Number(order.totalAmount), order.currency)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className="mt-0.5">{children}</dd>
        </div>
    )
}

/** Read-only sales order card; SD owns the order (click for a summary, Open in SD for the record). */
export default function SalesOrderCard({ order }: { order: Customer360Order }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <Card clickable bodyClass="p-4" onClick={() => setOpen(true)}>
                <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{order.orderNumber}</span>
                    <StatusBadge tone={ORDER_STATUS_TONE[order.status] ?? 'default'}>{formatEnumLabel(order.status)}</StatusBadge>
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums">{total(order)}</p>
                <p className="mt-1 text-xs text-gray-500">
                    {formatEnumLabel(order.channel)} · {formatDate(order.createdAt)}
                </p>
                {order.opportunity ? (
                    <p className="mt-1 truncate text-xs text-gray-500">From {order.opportunity.name}</p>
                ) : null}
            </Card>

            <Dialog isOpen={open} width={480} onClose={() => setOpen(false)} onRequestClose={() => setOpen(false)}>
                <div className="flex items-center gap-2">
                    <h5>Sales order {order.orderNumber}</h5>
                    <StatusBadge tone={ORDER_STATUS_TONE[order.status] ?? 'default'}>{formatEnumLabel(order.status)}</StatusBadge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Field label="Total">{total(order)}</Field>
                    <Field label="Lines">{order.lineCount}</Field>
                    <Field label="Channel">{formatEnumLabel(order.channel)}</Field>
                    <Field label="Source">{formatEnumLabel(order.source)}</Field>
                    <Field label="Created">{formatDate(order.createdAt)}</Field>
                    <Field label="From opportunity">
                        {order.opportunity ? (
                            <Link href={opportunityHref(order.opportunity.id)} className="text-primary hover:underline">
                                {order.opportunity.name}
                            </Link>
                        ) : (
                            '—'
                        )}
                    </Field>
                </dl>
                <p className="mt-4 text-xs text-gray-500">
                    Sales owns this order (pricing, fulfillment, billing); CRM shows it read-only.{' '}
                    <Link href={SD_SALES_ORDERS_PATH} className="text-primary hover:underline">
                        Open in SD
                    </Link>
                </p>
            </Dialog>
        </>
    )
}
