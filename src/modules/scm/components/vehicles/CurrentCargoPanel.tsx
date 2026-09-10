'use client'

import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import classNames from '@/utils/classNames'
import { useVehicleCargo } from '../../hooks/useVehicleCargo'
import { computeCapacity, formatLoadLine } from '../../utils/capacity'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { VehicleCargoResponse } from '../../types'

type CurrentCargoPanelProps = {
    vehicleId: string
    className?: string
    /** When provided, skip fetch (e.g. trip-scoped future use). */
    cargo?: VehicleCargoResponse | null
    loading?: boolean
    error?: string | null
}

/**
 * Read-only operational load on a vehicle (planned or in-transit trip).
 * Reusable later from Tracking — not a warehouse / MM stock view.
 */
export default function CurrentCargoPanel({
    vehicleId,
    className,
    cargo: cargoProp,
    loading: loadingProp,
    error: errorProp,
}: CurrentCargoPanelProps) {
    const hooked = useVehicleCargo(
        cargoProp !== undefined ? undefined : vehicleId,
    )
    const cargo = cargoProp !== undefined ? cargoProp : hooked.cargo
    const loading = loadingProp ?? hooked.loading
    const error = errorProp ?? hooked.error

    return (
        <AdaptiveCard className={className}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h6>Current cargo</h6>
                    <p className="mt-0.5 text-xs text-gray-500">
                        Operational load on this vehicle (not warehouse stock)
                    </p>
                </div>
                {cargo?.loadLabel === 'active' ? (
                    <StatusBadge tone="info">In transit</StatusBadge>
                ) : null}
                {cargo?.loadLabel === 'planned' ? (
                    <StatusBadge tone="warning">Planned</StatusBadge>
                ) : null}
            </div>

            {loading ? (
                <div className="flex justify-center py-10">
                    <Spinner size={28} />
                </div>
            ) : null}

            {!loading && error ? (
                <Alert showIcon type="danger" title="Could not load cargo">
                    {error}
                </Alert>
            ) : null}

            {!loading && !error && cargo ? (
                <>
                    <CargoSummary cargo={cargo} />

                    {cargo.shipments.length === 0 ? (
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                            No cargo on this vehicle.
                        </p>
                    ) : (
                        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
                            {cargo.shipments.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-gray-100">
                                            {item.materialCode
                                                ? `${item.materialCode} · `
                                                : ''}
                                            {item.reference}
                                        </p>
                                        <p className="truncate text-xs text-gray-500">
                                            {item.description ||
                                                item.shipToName ||
                                                item.shipToAddress}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-400">
                                            {item.stopSequence != null
                                                ? `Stop ${item.stopSequence}`
                                                : '—'}
                                            {item.shipToAddress
                                                ? ` · ${item.shipToAddress}`
                                                : ''}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                                        <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                                            {(item.quantity ?? 0).toLocaleString()}{' '}
                                            items
                                        </span>
                                        {item.isFragile ? (
                                            <StatusBadge tone="warning">
                                                Fragile
                                            </StatusBadge>
                                        ) : null}
                                        {item.requiresColdChain ? (
                                            <StatusBadge tone="info">
                                                Cold chain
                                            </StatusBadge>
                                        ) : null}
                                        <StatusBadge
                                            tone={statusTone(item.status)}
                                        >
                                            {formatStatusLabel(item.status)}
                                        </StatusBadge>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {cargo.tripId && cargo.tripCode ? (
                        <p className="mt-4 text-xs text-gray-500">
                            Trip{' '}
                            <Link
                                href="/scm/trips"
                                className="font-medium text-primary hover:underline"
                            >
                                {cargo.tripCode}
                            </Link>
                            {cargo.tripStatus
                                ? ` · ${formatStatusLabel(cargo.tripStatus)}`
                                : ''}
                        </p>
                    ) : null}
                </>
            ) : null}
        </AdaptiveCard>
    )
}

function CargoSummary({ cargo }: { cargo: VehicleCargoResponse }) {
    const { summary, loadLabel } = cargo
    const pct = summary.pctQty
    const barWidth =
        pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)))
    const loadLine =
        loadLabel === 'none'
            ? `${summary.loadedQty} / ${summary.capacityQty ?? '—'} items`
            : formatLoadLine(
                  computeCapacity(
                      { capacityQty: summary.capacityQty },
                      [{ quantity: summary.loadedQty }],
                  ),
              )

    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Load vs capacity
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {loadLine}
                    </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                    {summary.capacityWeightKg > 0 ? (
                        <p>
                            {summary.loadedWeightKg.toLocaleString()} /{' '}
                            {summary.capacityWeightKg.toLocaleString()} kg
                        </p>
                    ) : null}
                    {summary.fragileCount > 0 || summary.coldChainCount > 0 ? (
                        <p className="mt-0.5">
                            {summary.fragileCount > 0
                                ? `${summary.fragileCount} fragile`
                                : null}
                            {summary.fragileCount > 0 &&
                            summary.coldChainCount > 0
                                ? ' · '
                                : null}
                            {summary.coldChainCount > 0
                                ? `${summary.coldChainCount} cold chain`
                                : null}
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                    className={classNames(
                        'h-full rounded-full transition-all',
                        pct != null && pct > 100
                            ? 'bg-red-500'
                            : pct != null && pct >= 85
                              ? 'bg-amber-500'
                              : 'bg-primary',
                    )}
                    style={{ width: `${barWidth}%` }}
                />
            </div>
            {summary.message ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    {summary.message}
                </p>
            ) : null}
        </div>
    )
}
