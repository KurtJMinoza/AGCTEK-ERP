'use client'

import classNames from '@/utils/classNames'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import { usePlanTripWizard } from '../../hooks/usePlanTripWizard'
import type { Trip } from '../../types'
import PlanTripStepResources from './PlanTripStepResources'
import PlanTripStepStops from './PlanTripStepStops'
import PlanTripStepShipments from './PlanTripStepShipments'

type PlanTripWizardProps = {
    isOpen: boolean
    onClose: () => void
    onCreated: (trip: Trip) => void
}

const STEPS = [
    { id: 1 as const, label: 'Plan trip' },
    { id: 2 as const, label: 'Stops & windows' },
    { id: 3 as const, label: 'Assign shipments' },
]

export default function PlanTripWizard({
    isOpen,
    onClose,
    onCreated,
}: PlanTripWizardProps) {
    const wizard = usePlanTripWizard({
        open: isOpen,
        onCreated: (trip) => {
            onCreated(trip)
            onClose()
        },
    })

    const handleClose = () => {
        if (wizard.saving) return
        wizard.reset()
        onClose()
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={wizard.step === 1 ? 1080 : 760}
            onClose={handleClose}
            onRequestClose={handleClose}
            contentClassName="max-h-[90vh] overflow-y-auto"
        >
            <div className="mb-5 pe-8">
                <h4 className="mb-1">Plan trip</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Create a multi-stop trip and build the load against vehicle
                    capacity.
                </p>
            </div>

            <nav
                aria-label="Plan trip steps"
                className="mb-5 flex flex-wrap gap-2"
            >
                {STEPS.map((item) => {
                    const active = wizard.step === item.id
                    const done = wizard.step > item.id
                    return (
                        <div
                            key={item.id}
                            className={classNames(
                                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                                active &&
                                    'border-primary bg-primary/10 text-primary',
                                done &&
                                    !active &&
                                    'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
                                !active &&
                                    !done &&
                                    'border-gray-200 text-gray-500 dark:border-gray-700',
                            )}
                            aria-current={active ? 'step' : undefined}
                        >
                            <span
                                className={classNames(
                                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                                    active
                                        ? 'bg-primary text-white'
                                        : done
                                          ? 'bg-emerald-500 text-white'
                                          : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                                )}
                            >
                                {item.id}
                            </span>
                            {item.label}
                        </div>
                    )
                })}
            </nav>

            {wizard.submitError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {wizard.submitError}
                </Alert>
            ) : null}

            {wizard.step === 1 ? (
                <PlanTripStepResources
                    form={wizard.form}
                    vehicles={wizard.vehicles}
                    drivers={wizard.drivers}
                    loading={wizard.loadingOptions}
                    error={wizard.optionsError}
                    onChange={wizard.patchForm}
                />
            ) : null}

            {wizard.step === 2 ? (
                <PlanTripStepStops
                    stops={wizard.form.stops}
                    onUpdate={wizard.updateStop}
                    onAdd={wizard.addStop}
                    onRemove={wizard.removeStop}
                    onMove={wizard.moveStop}
                />
            ) : null}

            {wizard.step === 3 ? (
                <PlanTripStepShipments
                    stops={wizard.form.stops}
                    vehicle={wizard.selectedVehicle}
                    readyShipments={wizard.readyShipments}
                    assignedShipmentIds={wizard.assignedShipmentIds}
                    capacity={wizard.capacity}
                    loading={wizard.loadingOptions}
                    error={wizard.optionsError}
                    onToggle={wizard.toggleStopShipment}
                />
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                <div>
                    {wizard.step > 1 ? (
                        <Button
                            type="button"
                            variant="plain"
                            disabled={wizard.saving}
                            onClick={wizard.goBack}
                        >
                            Back
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="plain"
                            disabled={wizard.saving}
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>
                    )}
                </div>
                <div className="flex gap-2">
                    {wizard.step < 3 ? (
                        <Button
                            type="button"
                            variant="solid"
                            onClick={wizard.goNext}
                        >
                            Continue
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="solid"
                            loading={wizard.saving}
                            disabled={
                                wizard.saving ||
                                (wizard.selectedVehicle != null &&
                                    wizard.selectedShipments.length > 0 &&
                                    !wizard.capacity.canFit)
                            }
                            onClick={() => void wizard.save()}
                        >
                            Save trip
                        </Button>
                    )}
                </div>
            </div>
        </Dialog>
    )
}
