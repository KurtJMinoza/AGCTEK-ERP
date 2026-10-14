'use client'

import type {
    CustomerOrderStatus,
    OrderTrackingCheckpoint,
} from '@/modules/sd/services/salesOrderDashboardService'
import { STEP_ICON } from './OrderTrackingParts'

const formatTime = (iso: string) =>
    new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(iso))

const isNegative = (code: CustomerOrderStatus) =>
    code === 'DELIVERY_FAILED' || code === 'CANCELLED'

function Marker({ checkpoint }: { checkpoint: OrderTrackingCheckpoint }) {
    const Icon = STEP_ICON[checkpoint.code]
    const tone =
        checkpoint.current && isNegative(checkpoint.code)
            ? 'bg-rose-600 text-white ring-4 ring-rose-100'
            : checkpoint.current
              ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
              : checkpoint.done
                ? 'bg-emerald-100 text-emerald-700'
                : 'border-2 border-gray-200 bg-white text-gray-400'
    return (
        <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}
        >
            <Icon className="text-sm" />
        </span>
    )
}

/** Vertical order-tracking timeline; checkpoints are computed server-side. */
export default function OrderTrackingTimeline({
    checkpoints,
}: {
    checkpoints: OrderTrackingCheckpoint[]
}) {
    return (
        <ol className="relative">
            {checkpoints.map((checkpoint, index) => {
                const last = index === checkpoints.length - 1
                const negative = checkpoint.current && isNegative(checkpoint.code)
                return (
                    <li key={checkpoint.code} className="relative flex gap-3 pb-5 last:pb-0">
                        {!last && (
                            <span
                                aria-hidden
                                className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 ${
                                    checkpoints[index + 1]?.done
                                        ? 'bg-emerald-300'
                                        : 'bg-gray-200'
                                }`}
                            />
                        )}
                        <Marker checkpoint={checkpoint} />
                        <div className="min-w-0 flex-1 pt-0.5">
                            <p
                                className={`text-sm ${
                                    negative
                                        ? 'font-bold text-rose-700'
                                        : checkpoint.current
                                          ? 'font-bold text-emerald-800'
                                          : checkpoint.done
                                            ? 'font-semibold text-gray-900'
                                            : 'font-medium text-gray-400'
                                }`}
                            >
                                {checkpoint.label}
                            </p>
                            {checkpoint.done && checkpoint.at && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                    {formatTime(checkpoint.at)}
                                </p>
                            )}
                            {checkpoint.note && (
                                <p
                                    className={`mt-1 text-xs ${
                                        negative ? 'text-rose-600' : 'text-gray-500'
                                    }`}
                                >
                                    {checkpoint.note}
                                </p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}
