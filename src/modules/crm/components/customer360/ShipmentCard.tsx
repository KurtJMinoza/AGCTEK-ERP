'use client'

import { useState } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatDate, formatEnumLabel } from '../../utils/format'
import { SHIPMENT_STATUS_TONE } from './statusTones'
import type { Customer360Shipment } from '../../types'

export const SCM_SHIPMENTS_PATH = '/scm/shipments'

const eta = (s: Customer360Shipment) => formatDate(s.latestDeliveryAt ?? s.requestedDeliveryAt)
const delivered = (s: Customer360Shipment) =>
    s.deliveredAt ? `${formatDate(s.deliveredAt)}${s.hasProofOfDelivery ? ' · POD' : ''}` : null

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className="mt-0.5">{children}</dd>
        </div>
    )
}

type ShipmentCardProps = {
    shipment: Customer360Shipment
    /** Order number of `shipment.salesOrderId`, when it is one of the listed orders. */
    orderNumber: string | null
}

/** Read-only shipment card; SCM owns the shipment (click for a summary, Open in SCM for the record). */
export default function ShipmentCard({ shipment, orderNumber }: ShipmentCardProps) {
    const [open, setOpen] = useState(false)
    const deliveredText = delivered(shipment)
    return (
        <>
            <Card clickable bodyClass="p-4" onClick={() => setOpen(true)}>
                <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold">{shipment.reference}</span>
                    <StatusBadge tone={SHIPMENT_STATUS_TONE[shipment.status] ?? 'default'}>{formatEnumLabel(shipment.status)}</StatusBadge>
                </div>
                <p className="mt-2 text-sm">{orderNumber ? `Order ${orderNumber}` : 'Order —'}</p>
                <p className="mt-1 text-xs text-gray-500">
                    {deliveredText ? `Delivered ${deliveredText}` : `ETA ${eta(shipment)}`}
                </p>
                {shipment.exceptionCode ? (
                    <p className="mt-1 text-xs text-red-500" title={shipment.exceptionNote ?? undefined}>
                        {formatEnumLabel(shipment.exceptionCode)}
                    </p>
                ) : null}
            </Card>

            <Dialog isOpen={open} width={480} onClose={() => setOpen(false)} onRequestClose={() => setOpen(false)}>
                <div className="flex items-center gap-2">
                    <h5>Shipment {shipment.reference}</h5>
                    <StatusBadge tone={SHIPMENT_STATUS_TONE[shipment.status] ?? 'default'}>{formatEnumLabel(shipment.status)}</StatusBadge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Field label="Order">{orderNumber ?? '—'}</Field>
                    <Field label="ETA">{eta(shipment)}</Field>
                    <Field label="Requested delivery">{formatDate(shipment.requestedDeliveryAt)}</Field>
                    <Field label="Delivered">{deliveredText ?? '—'}</Field>
                    <Field label="Carrier / tracking">
                        {shipment.trackingNumber
                            ? `${shipment.carrier ? `${shipment.carrier} · ` : ''}${shipment.trackingNumber}`
                            : '—'}
                    </Field>
                    <Field label="Exception">
                        {shipment.exceptionCode
                            ? `${formatEnumLabel(shipment.exceptionCode)}${shipment.exceptionNote ? ` — ${shipment.exceptionNote}` : ''}`
                            : '—'}
                    </Field>
                </dl>
                <p className="mt-4 text-xs text-gray-500">
                    Logistics owns this shipment (trips, delivery, proof of delivery); CRM shows it read-only.{' '}
                    <Link href={SCM_SHIPMENTS_PATH} className="text-primary hover:underline">
                        Open in SCM
                    </Link>
                </p>
            </Dialog>
        </>
    )
}
