'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { HiOutlineExclamationCircle, HiOutlineRefresh } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import MarketplaceHeader from '../components/MarketplaceHeader'
import OrderTrackingTimeline from '../components/OrderTrackingTimeline'
import {
    CourierTrackingPanel,
    DeliveryMapPanel,
    OrderProgressStepper,
    TrackingStatusPill,
} from '../components/OrderTrackingParts'
import {
    getPublicOrderTracking,
    type OrderTracking,
} from '@/modules/sd/services/salesOrderDashboardService'
import { MARKETPLACE_PATH } from '../host'

const TRACKING_POLL_MS = 45_000

/** Read-only order tracking opened from a shared link; no sign-in required. */
const MarketplaceTrackPage = ({ token }: { token: string }) => {
    const [tracking, setTracking] = useState<OrderTracking | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setTracking(await getPublicOrderTracking(token))
            setError(null)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'This tracking link is invalid or has expired.',
            )
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => {
        void load()
    }, [load])

    const inTransit = tracking?.customerStatus === 'IN_TRANSIT'
    useEffect(() => {
        if (!inTransit) return
        const id = window.setInterval(() => {
            getPublicOrderTracking(token)
                .then(setTracking)
                .catch(() => undefined)
        }, TRACKING_POLL_MS)
        return () => window.clearInterval(id)
    }, [inTransit, token])

    return (
        <div className="flex min-h-screen flex-col bg-[#f8fafc] text-gray-700 antialiased">
            <MarketplaceHeader />
            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
                {loading && !tracking ? (
                    <div className="flex h-64 items-center justify-center">
                        <Spinner size="lg" />
                    </div>
                ) : !tracking ? (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
                        <HiOutlineExclamationCircle className="text-4xl text-amber-500" />
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">
                                Tracking unavailable
                            </h1>
                            <p className="mt-1 text-sm text-gray-500">
                                {error ?? 'This tracking link is invalid or has expired.'}
                            </p>
                        </div>
                        <Link
                            href={MARKETPLACE_PATH}
                            className="text-sm font-semibold text-emerald-700 hover:underline"
                        >
                            Go to the marketplace
                        </Link>
                    </div>
                ) : (
                    <article className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-5 py-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                    Order
                                </p>
                                <h1 className="font-mono text-lg font-bold text-gray-900">
                                    #{tracking.orderNumber}
                                </h1>
                            </div>
                            <div className="flex items-center gap-2">
                                <TrackingStatusPill
                                    status={tracking.customerStatus}
                                    label={tracking.customerStatusLabel}
                                />
                                <Button
                                    size="xs"
                                    variant="plain"
                                    loading={loading}
                                    icon={<HiOutlineRefresh />}
                                    onClick={() => void load()}
                                >
                                    Refresh
                                </Button>
                            </div>
                        </header>
                        <div className="space-y-5 px-5 py-4">
                            <OrderProgressStepper checkpoints={tracking.checkpoints} />
                            <CourierTrackingPanel tracking={tracking} />
                            <DeliveryMapPanel tracking={tracking} />
                            <OrderTrackingTimeline checkpoints={tracking.checkpoints} />
                        </div>
                    </article>
                )}
            </main>
        </div>
    )
}

export default MarketplaceTrackPage
