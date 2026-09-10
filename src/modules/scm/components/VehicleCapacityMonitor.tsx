'use client'

import Progress from '@/components/ui/Progress'
import Alert from '@/components/ui/Alert'
import classNames from '@/utils/classNames'
import { computeCapacity, type LoadLevel } from '../utils/capacity'
import type { Shipment, Vehicle } from '../types'

type VehicleCapacityMonitorProps = {
    vehicle: Vehicle | null
    shipments: Pick<Shipment, 'quantity'>[]
}

const levelBarClass: Record<Exclude<LoadLevel, 'unknown'>, string> = {
    under: 'bg-emerald-500',
    near: 'bg-amber-500',
    over: 'bg-red-500',
}

const levelLabel: Record<LoadLevel, string> = {
    unknown: 'Cannot compute',
    under: 'Under limit',
    near: 'Near limit',
    over: 'Over limit',
}

export default function VehicleCapacityMonitor({
    vehicle,
    shipments,
}: VehicleCapacityMonitorProps) {
    if (!vehicle) return null

    const snapshot = computeCapacity(vehicle, shipments)
    const displayPct =
        snapshot.pctQty == null ? null : Math.round(snapshot.pctQty * 10) / 10
    const barPct = snapshot.pctQty == null ? 0 : Math.min(snapshot.pctQty, 100)

    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {vehicle.plateNumber}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {vehicle.make} {vehicle.model}
                    {vehicle.code ? ` · ${vehicle.code}` : ''}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                    Capacity:{' '}
                    {snapshot.capacityQty == null
                        ? '—'
                        : `${snapshot.capacityQty.toLocaleString()} items`}
                </p>
            </div>

            <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                        Loaded
                    </span>
                    <span
                        className={classNames(
                            'text-xs',
                            snapshot.level === 'over' && 'text-red-600',
                            snapshot.level === 'near' && 'text-amber-600',
                            snapshot.level === 'under' && 'text-emerald-600',
                        )}
                    >
                        {levelLabel[snapshot.level]}
                        {displayPct != null ? ` · ${displayPct}%` : ''}
                    </span>
                </div>
                <Progress
                    percent={barPct}
                    showInfo={false}
                    customColorClass={
                        snapshot.level === 'unknown'
                            ? 'bg-gray-300'
                            : levelBarClass[snapshot.level]
                    }
                />
                <p className="mt-1 text-xs text-gray-500">
                    {snapshot.loadedQty.toLocaleString()} /{' '}
                    {snapshot.capacityQty == null
                        ? '—'
                        : snapshot.capacityQty.toLocaleString()}{' '}
                    items
                </p>
            </div>

            {snapshot.message ? (
                <Alert
                    showIcon
                    className="mt-4"
                    type={snapshot.canFit ? 'warning' : 'danger'}
                    title={
                        snapshot.level === 'over'
                            ? 'Over capacity'
                            : 'Cannot assign'
                    }
                >
                    {snapshot.message}
                </Alert>
            ) : (
                <p className="mt-3 text-xs text-gray-500">
                    {snapshot.level === 'near'
                        ? 'Near capacity — review before confirming.'
                        : 'Within item capacity.'}
                </p>
            )}
        </div>
    )
}
