'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import { Form, FormItem } from '@/components/ui/Form'
import StatusBadge from '@/components/shared/StatusBadge'
import { useVehicleDetail } from '../hooks/useVehicleDetail'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { VehicleStatus, VehicleType } from '../types'
import {
    VehicleMaintenancePanel,
    VehicleOverviewPanel,
    VehicleTelematicsPanel,
    VehicleTripsPanel,
} from './VehicleDetailPanels'
import CurrentCargoPanel from './vehicles/CurrentCargoPanel'

const { TabList, TabNav, TabContent } = Tabs

type Option = { value: string; label: string }

const typeOptions: Option[] = [
    { value: 'TRUCK', label: 'Truck' },
    { value: 'VAN', label: 'Van' },
    { value: 'TRAILER', label: 'Trailer' },
    { value: 'REEFER', label: 'Reefer' },
    { value: 'OTHER', label: 'Other' },
]

const statusOptions: Option[] = [
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'OUT_OF_SERVICE', label: 'Out of Service' },
    { value: 'INACTIVE', label: 'Inactive' },
]

type VehicleViewDialogProps = {
    vehicleId: string | null
    isOpen: boolean
    onClose: () => void
    onUpdated?: () => void
}

export default function VehicleViewDialog({
    vehicleId,
    isOpen,
    onClose,
    onUpdated,
}: VehicleViewDialogProps) {
    const {
        vehicle,
        latest,
        history,
        maintenance,
        trips,
        loading,
        error,
        notFound,
        update,
    } = useVehicleDetail(isOpen ? (vehicleId ?? undefined) : undefined)

    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState<Record<string, string>>({})

    const openEdit = () => {
        if (!vehicle) return
        setForm({
            code: vehicle.code,
            plateNumber: vehicle.plateNumber,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year != null ? String(vehicle.year) : '',
            type: vehicle.type,
            status: vehicle.status,
            capacityQty: String(vehicle.capacityQty ?? ''),
            odometerKm: String(vehicle.odometerKm),
            maintenanceThresholdKm:
                vehicle.maintenanceThresholdKm != null
                    ? String(vehicle.maintenanceThresholdKm)
                    : '',
            telematicsDeviceId: vehicle.telematicsDeviceId ?? '',
            notes: vehicle.notes ?? '',
        })
        setFormError(null)
        setEditing(true)
    }

    const handleClose = () => {
        setEditing(false)
        setFormError(null)
        onClose()
    }

    const onSave = async () => {
        setSaving(true)
        setFormError(null)
        try {
            await update({
                code: form.code,
                plateNumber: form.plateNumber,
                make: form.make,
                model: form.model,
                year: form.year ? Number(form.year) : null,
                type: form.type as VehicleType,
                status: form.status as VehicleStatus,
                capacityQty: Number(form.capacityQty),
                odometerKm: Number(form.odometerKm || 0),
                maintenanceThresholdKm: form.maintenanceThresholdKm
                    ? Number(form.maintenanceThresholdKm)
                    : null,
                telematicsDeviceId: form.telematicsDeviceId || null,
                notes: form.notes || null,
            })
            setEditing(false)
            onUpdated?.()
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Failed to update vehicle',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            onRequestClose={handleClose}
            width={960}
            contentClassName="max-h-[90vh]"
        >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 pr-8">
                <div>
                    <h4 className="mb-1">
                        {vehicle?.plateNumber ?? 'Vehicle'}
                    </h4>
                    {vehicle ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {vehicle.make} {vehicle.model}
                            {vehicle.year ? ` (${vehicle.year})` : ''} ·{' '}
                            {formatStatusLabel(vehicle.type)}
                        </p>
                    ) : null}
                </div>
                {vehicle && !editing ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={statusTone(vehicle.status)}>
                            {formatStatusLabel(vehicle.status)}
                        </StatusBadge>
                        {vehicle.routingBlocked ? (
                            <StatusBadge tone="danger">
                                Routing blocked
                            </StatusBadge>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {loading && !vehicle ? (
                <div className="flex justify-center py-12">
                    <Spinner size={36} />
                </div>
            ) : null}

            {error ? (
                <Alert showIcon type="danger" className="mb-3" title="API error">
                    {error}
                </Alert>
            ) : null}

            {notFound && !loading ? (
                <Alert showIcon type="warning" title="Not found">
                    This vehicle does not exist or was removed.
                </Alert>
            ) : null}

            {vehicle && editing ? (
                <>
                    {formError ? (
                        <Alert showIcon type="danger" className="mb-3">
                            {formError}
                        </Alert>
                    ) : null}
                    <Form
                        onSubmit={(e) => {
                            e.preventDefault()
                            void onSave()
                        }}
                    >
                        <ScrollBar className="max-h-[60vh] pr-2">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <FormItem label="Code">
                                    <Input
                                        value={form.code}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                code: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Plate number">
                                    <Input
                                        value={form.plateNumber}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                plateNumber: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Make">
                                    <Input
                                        value={form.make}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                make: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Model">
                                    <Input
                                        value={form.model}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                model: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Year">
                                    <Input
                                        value={form.year}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                year: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Type">
                                    <Select
                                        options={typeOptions}
                                        value={typeOptions.find(
                                            (o) => o.value === form.type,
                                        )}
                                        onChange={(option) =>
                                            setForm((f) => ({
                                                ...f,
                                                type:
                                                    (option as Option | null)
                                                        ?.value || 'TRUCK',
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Status">
                                    <Select
                                        options={statusOptions}
                                        value={statusOptions.find(
                                            (o) => o.value === form.status,
                                        )}
                                        onChange={(option) =>
                                            setForm((f) => ({
                                                ...f,
                                                status:
                                                    (option as Option | null)
                                                        ?.value || 'AVAILABLE',
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Capacity (items)">
                                    <Input
                                        value={form.capacityQty}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                capacityQty: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Odometer (km)">
                                    <Input
                                        value={form.odometerKm}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                odometerKm: e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem label="Maintenance threshold (km)">
                                    <Input
                                        value={form.maintenanceThresholdKm}
                                        placeholder="e.g. 50000 — flags service when reached"
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                maintenanceThresholdKm:
                                                    e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                                <FormItem
                                    label="Telematics device ID (flespi ident)"
                                    extra="First 14 digits of VL502 IMEI (flespi JT808 ident)"
                                >
                                    <Input
                                        value={form.telematicsDeviceId}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                telematicsDeviceId:
                                                    e.target.value,
                                            }))
                                        }
                                    />
                                </FormItem>
                            </div>
                            <FormItem label="Notes" className="mt-3">
                                <Input
                                    textArea
                                    value={form.notes}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            notes: e.target.value,
                                        }))
                                    }
                                />
                            </FormItem>
                        </ScrollBar>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button
                                type="button"
                                onClick={() => setEditing(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="solid"
                                loading={saving}
                            >
                                Save
                            </Button>
                        </div>
                    </Form>
                </>
            ) : null}

            {vehicle && !editing ? (
                <>
                    <ScrollBar className="max-h-[65vh] pr-1">
                        <Tabs defaultValue="overview">
                            <TabList>
                                <TabNav value="overview">Overview</TabNav>
                                <TabNav value="telematics">Telematics</TabNav>
                                <TabNav value="maintenance">Maintenance</TabNav>
                                <TabNav value="trips">Trips</TabNav>
                            </TabList>
                            <div className="mt-4">
                                <TabContent value="overview">
                                    <div className="space-y-4">
                                        <VehicleOverviewPanel
                                            vehicle={vehicle}
                                            latest={latest}
                                            trips={trips}
                                        />
                                        <CurrentCargoPanel
                                            vehicleId={vehicle.id}
                                        />
                                    </div>
                                </TabContent>
                                <TabContent value="telematics">
                                    <VehicleTelematicsPanel
                                        latest={latest}
                                        history={history}
                                    />
                                </TabContent>
                                <TabContent value="maintenance">
                                    <VehicleMaintenancePanel
                                        records={maintenance}
                                    />
                                </TabContent>
                                <TabContent value="trips">
                                    <VehicleTripsPanel trips={trips} />
                                </TabContent>
                            </div>
                        </Tabs>
                    </ScrollBar>

                    <div className="mt-4 flex justify-end gap-2">
                        <Button onClick={handleClose}>Close</Button>
                        <Button variant="solid" onClick={openEdit}>
                            Edit
                        </Button>
                    </div>
                </>
            ) : null}
        </Dialog>
    )
}
