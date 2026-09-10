'use client'

import classNames from '@/utils/classNames'
import { FormItem } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import ScrollBar from '@/components/ui/ScrollBar'
import StatusBadge from '@/components/shared/StatusBadge'
import type { Driver, Vehicle } from '../../types'
import type { PlanTripWizardState } from '../../hooks/usePlanTripWizard'
import { formatStatusLabel, statusTone } from '../../utils/status'

type PlanTripStepResourcesProps = {
    form: PlanTripWizardState
    vehicles: Vehicle[]
    drivers: Driver[]
    loading: boolean
    error: string | null
    onChange: (patch: Partial<PlanTripWizardState>) => void
}

export default function PlanTripStepResources({
    form,
    vehicles,
    drivers,
    loading,
    error,
    onChange,
}: PlanTripStepResourcesProps) {
    const selectedVehicle =
        vehicles.find((vehicle) => vehicle.id === form.vehicleId) ?? null
    const selectedDriver =
        drivers.find((driver) => driver.id === form.driverId) ?? null

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Pick a vehicle (left) and optional driver (right). Trip details
                stay in the center. Only AVAILABLE, routing-eligible vehicles
                are listed.
            </p>

            {error ? (
                <Alert showIcon type="danger" title="Could not load options">
                    {error}
                </Alert>
            ) : null}

            {loading ? (
                <p className="text-sm text-gray-500">
                    Loading vehicles & drivers…
                </p>
            ) : null}

            {!loading && !error && vehicles.length === 0 ? (
                <Alert showIcon type="warning">
                    No eligible vehicles available. You can still continue
                    without assigning a vehicle.
                </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:gap-4">
                {/* Left — vehicles */}
                <section className="flex min-h-[280px] flex-col rounded-xl border border-gray-200 dark:border-gray-700 xl:col-span-3">
                    <header className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                        <h5 className="text-sm font-semibold">Vehicles</h5>
                        <p className="text-xs text-gray-500">
                            {vehicles.length} eligible
                        </p>
                    </header>
                    <ScrollBar className="max-h-[340px] flex-1">
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            <li>
                                <button
                                    type="button"
                                    className={classNames(
                                        'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition',
                                        !form.vehicleId
                                            ? 'bg-primary-subtle'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                    )}
                                    onClick={() => onChange({ vehicleId: '' })}
                                >
                                    <span className="font-medium">
                                        Unassigned
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        Draft without a vehicle
                                    </span>
                                </button>
                            </li>
                            {vehicles.map((vehicle) => {
                                const selected = form.vehicleId === vehicle.id
                                return (
                                    <li key={vehicle.id}>
                                        <button
                                            type="button"
                                            className={classNames(
                                                'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition',
                                                selected
                                                    ? 'bg-primary-subtle'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                            )}
                                            onClick={() =>
                                                onChange({
                                                    vehicleId: vehicle.id,
                                                })
                                            }
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {vehicle.plateNumber}
                                                </span>
                                                <StatusBadge
                                                    tone={statusTone(
                                                        vehicle.status,
                                                    )}
                                                >
                                                    {formatStatusLabel(
                                                        vehicle.status,
                                                    )}
                                                </StatusBadge>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {vehicle.code} · {vehicle.make}{' '}
                                                {vehicle.model}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                Cap {(vehicle.capacityQty ?? 0).toLocaleString()}{' '}
                                                items
                                            </p>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </ScrollBar>
                </section>

                {/* Center — trip shell */}
                <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700 xl:col-span-6">
                    <h5 className="mb-3 text-sm font-semibold">Trip details</h5>
                    <div className="space-y-3">
                        <FormItem label="Trip code (optional)">
                            <Input
                                value={form.code}
                                placeholder="Auto-generated if blank"
                                onChange={(e) =>
                                    onChange({ code: e.target.value })
                                }
                            />
                        </FormItem>
                        <FormItem label="Planned start">
                            <Input
                                type="datetime-local"
                                value={form.plannedStartAt}
                                onChange={(e) =>
                                    onChange({
                                        plannedStartAt: e.target.value,
                                    })
                                }
                            />
                        </FormItem>
                        <FormItem label="Notes">
                            <Input
                                textArea
                                rows={4}
                                value={form.notes}
                                onChange={(e) =>
                                    onChange({ notes: e.target.value })
                                }
                            />
                        </FormItem>

                        <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/50">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Selection
                            </p>
                            <p className="text-gray-800 dark:text-gray-100">
                                <span className="text-gray-500">Vehicle: </span>
                                {selectedVehicle
                                    ? `${selectedVehicle.plateNumber} (${selectedVehicle.code})`
                                    : 'Unassigned'}
                            </p>
                            <p className="mt-1 text-gray-800 dark:text-gray-100">
                                <span className="text-gray-500">Driver: </span>
                                {selectedDriver
                                    ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
                                    : 'None yet'}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Right — drivers */}
                <section className="flex min-h-[280px] flex-col rounded-xl border border-gray-200 dark:border-gray-700 xl:col-span-3">
                    <header className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                        <h5 className="text-sm font-semibold">Drivers</h5>
                        <p className="text-xs text-gray-500">
                            {drivers.length} available
                        </p>
                    </header>
                    <ScrollBar className="max-h-[340px] flex-1">
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                            <li>
                                <button
                                    type="button"
                                    className={classNames(
                                        'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition',
                                        !form.driverId
                                            ? 'bg-primary-subtle'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                    )}
                                    onClick={() => onChange({ driverId: '' })}
                                >
                                    <span className="font-medium">
                                        No driver
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        Assign later
                                    </span>
                                </button>
                            </li>
                            {drivers.map((driver) => {
                                const selected = form.driverId === driver.id
                                return (
                                    <li key={driver.id}>
                                        <button
                                            type="button"
                                            className={classNames(
                                                'flex w-full flex-col gap-1 px-3 py-2.5 text-left transition',
                                                selected
                                                    ? 'bg-primary-subtle'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                                            )}
                                            onClick={() =>
                                                onChange({
                                                    driverId: driver.id,
                                                })
                                            }
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {driver.firstName}{' '}
                                                    {driver.lastName}
                                                </span>
                                                <StatusBadge
                                                    tone={statusTone(
                                                        driver.status,
                                                    )}
                                                >
                                                    {formatStatusLabel(
                                                        driver.status,
                                                    )}
                                                </StatusBadge>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {driver.licenseNumber}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {driver.phone}
                                            </p>
                                        </button>
                                    </li>
                                )
                            })}
                            {!loading && drivers.length === 0 ? (
                                <li className="px-3 py-6 text-center text-xs text-gray-500">
                                    No available drivers
                                </li>
                            ) : null}
                        </ul>
                    </ScrollBar>
                </section>
            </div>
        </div>
    )
}
