'use client'

import dynamic from 'next/dynamic'
import {
    HiOutlineArchive,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineCube,
    HiOutlineExclamationCircle,
    HiOutlineLocationMarker,
    HiOutlineShoppingBag,
    HiOutlineTruck,
    HiOutlineXCircle,
} from 'react-icons/hi'
import type { IconType } from 'react-icons'
import type {
    CustomerOrderStatus,
    OrderTracking,
} from '@/modules/sd/services/salesOrderDashboardService'

const OrderTrackingMap = dynamic(() => import('./OrderTrackingMap'), {
    ssr: false,
    loading: () => (
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 sm:h-72" />
    ),
})

const PILL_TONE: Record<CustomerOrderStatus, { className: string; icon: IconType }> = {
    PLACED: { className: 'bg-gray-50 text-gray-700 ring-gray-500/20', icon: HiOutlineShoppingBag },
    CONFIRMED: { className: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: HiOutlineClock },
    PREPARING: { className: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: HiOutlineClock },
    READY_FOR_DELIVERY: { className: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: HiOutlineClock },
    IN_TRANSIT: { className: 'bg-blue-50 text-blue-700 ring-blue-600/20', icon: HiOutlineTruck },
    DELIVERED: { className: 'bg-shop-50 text-shop-700 ring-shop-600/20', icon: HiOutlineCheckCircle },
    DELIVERY_FAILED: { className: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: HiOutlineExclamationCircle },
    CANCELLED: { className: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: HiOutlineXCircle },
}

export function TrackingStatusPill({
    status,
    label,
}: {
    status: CustomerOrderStatus
    label: string
}) {
    const tone = PILL_TONE[status]
    const Icon = tone.icon
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${tone.className}`}
        >
            <Icon className="text-sm" />
            {label}
        </span>
    )
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function formatEtaWindow(eta: NonNullable<NonNullable<OrderTracking['map']>['eta']>) {
    return `${timeFormat.format(new Date(eta.from))} – ${timeFormat.format(new Date(eta.to))}`
}

const eventTimeFormat = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
})

/** Third-party courier: carrier, tracking number and the courier's own status history. */
export function CourierTrackingPanel({ tracking }: { tracking: OrderTracking }) {
    const courier = tracking.courier
    if (!courier) return null
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                    <HiOutlineTruck className="mt-0.5 shrink-0 text-base text-gray-500" />
                    <div className="text-sm">
                        <p className="font-semibold text-gray-900">
                            Shipped with {courier.carrierName}
                        </p>
                        {courier.trackingNumber ? (
                            <p className="text-xs text-gray-500">
                                Tracking no.{' '}
                                <span className="font-mono font-semibold text-gray-700">
                                    {courier.trackingNumber}
                                </span>
                            </p>
                        ) : null}
                    </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-inset ring-gray-500/20">
                    {courier.statusLabel}
                </span>
            </div>
            {courier.trackingUrl ? (
                <a
                    href={courier.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline"
                >
                    Track on {courier.carrierName}&rsquo;s site
                </a>
            ) : null}
            {courier.events.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2">
                    {courier.events.map((event) => (
                        <li
                            key={`${event.status}-${event.at}`}
                            className="flex justify-between gap-3 text-xs"
                        >
                            <span className="text-gray-700">{event.label}</span>
                            <span className="shrink-0 text-gray-500">
                                {eventTimeFormat.format(new Date(event.at))}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

/** Where the customer is in the driver's route: next, or N stops before theirs. */
function StopsAwayBadge({ tracking }: { tracking: OrderTracking }) {
    const away = tracking.stopsAway
    if (away == null) return null
    return (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-600/20">
            <HiOutlineLocationMarker className="text-sm" />
            {away === 0
                ? 'Out for delivery — next stop'
                : `${away} ${away === 1 ? 'stop' : 'stops'} before yours`}
        </div>
    )
}

/** Delayed courier map; only for in-transit orders, timeline stays the source of truth. */
export function DeliveryMapPanel({ tracking }: { tracking: OrderTracking }) {
    const map = tracking.map
    // Third-party couriers have no vehicle position — CourierTrackingPanel covers them.
    if (tracking.courier) return null
    if (tracking.customerStatus !== 'IN_TRANSIT' || !map) return null

    if (!map.available || map.latitude == null || map.longitude == null) {
        return (
            <div className="space-y-2">
                <StopsAwayBadge tracking={tracking} />
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-800">
                    <HiOutlineTruck className="mt-0.5 shrink-0 text-base" />
                    <span>
                        {map.reason === 'WAITING_FOR_UPDATE'
                            ? 'Waiting for a location update from your courier.'
                            : 'Your courier is on the way. Their location will appear here once available.'}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <StopsAwayBadge tracking={tracking} />
                {map.eta && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700 ring-1 ring-inset ring-gray-500/20">
                        <HiOutlineClock className="text-sm" />
                        Estimated arrival {formatEtaWindow(map.eta)}
                    </div>
                )}
            </div>
            <OrderTrackingMap
                courier={{ lat: map.latitude, lng: map.longitude }}
                destination={tracking.destination}
            />
            <p className="text-[11px] text-gray-500">
                Approximate courier location · {map.lastUpdatedLabel}. Location
                updates every few minutes.
            </p>
        </div>
    )
}

export const STEP_ICON: Record<CustomerOrderStatus, IconType> = {
    PLACED: HiOutlineShoppingBag,
    CONFIRMED: HiOutlineClipboardList,
    PREPARING: HiOutlineCube,
    READY_FOR_DELIVERY: HiOutlineArchive,
    IN_TRANSIT: HiOutlineTruck,
    DELIVERED: HiOutlineCheckCircle,
    DELIVERY_FAILED: HiOutlineExclamationCircle,
    CANCELLED: HiOutlineXCircle,
}

/** At-a-glance progress from server checkpoints (full history lives in the timeline). */
export function OrderProgressStepper({
    checkpoints,
}: {
    checkpoints: OrderTracking['checkpoints']
}) {
    if (checkpoints.some((c) => c.code === 'CANCELLED')) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-2.5 text-xs font-medium text-rose-700">
                <HiOutlineXCircle className="shrink-0 text-base text-rose-600" />
                <span>
                    This order was cancelled. Reserved inventory has been released.
                </span>
            </div>
        )
    }

    const activeIndex = Math.max(
        0,
        checkpoints.findIndex((c) => c.current),
    )

    return (
        <div className="w-full overflow-x-auto py-2">
            <div className="relative flex min-w-[480px] items-start justify-between">
                <div className="absolute left-6 right-6 top-4 h-1 -translate-y-1/2 bg-gray-100">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-shop-500 to-leaf-500 transition-all duration-500"
                        style={{
                            width: `${(activeIndex / Math.max(1, checkpoints.length - 1)) * 100}%`,
                        }}
                    />
                </div>

                {checkpoints.map((step) => {
                    const failed = step.current && step.code === 'DELIVERY_FAILED'
                    const StepIcon = STEP_ICON[step.code]
                    return (
                        <div
                            key={step.code}
                            className="relative z-10 flex w-20 flex-col items-center text-center"
                        >
                            <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all duration-300 ${
                                    failed
                                        ? 'bg-rose-600 text-white ring-4 ring-rose-100'
                                        : step.done
                                          ? 'bg-gradient-to-br from-shop-500 to-leaf-600 text-white ring-4 ring-shop-50'
                                          : 'border-2 border-gray-200 bg-white text-gray-400'
                                }`}
                            >
                                <StepIcon
                                    className={`text-sm ${step.current && !failed ? 'animate-pulse' : ''}`}
                                />
                            </div>
                            <span
                                className={`mt-1.5 text-[11px] leading-tight tracking-tight ${
                                    failed
                                        ? 'font-semibold text-rose-700'
                                        : step.done
                                          ? 'font-semibold text-gray-900'
                                          : 'font-medium text-gray-400'
                                }`}
                            >
                                {step.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
