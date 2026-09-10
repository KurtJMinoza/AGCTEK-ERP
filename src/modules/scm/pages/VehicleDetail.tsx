'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import { Form, FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    VehicleMaintenancePanel,
    VehicleOverviewPanel,
    VehicleTelematicsPanel,
    VehicleTripsPanel,
} from '../components/VehicleDetailPanels'
import CurrentCargoPanel from '../components/vehicles/CurrentCargoPanel'
import { useVehicleDetail } from '../hooks/useVehicleDetail'
import { scmVehicleBreadcrumbs } from '../utils/breadcrumbs'
import { formatStatusLabel, statusTone } from '../utils/status'
import type { VehicleStatus, VehicleType } from '../types'

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

export default function VehicleDetailPage() {
    const params = useParams<{ id: string }>()
    const vehicleId = params?.id
    const {
        vehicle,
        latest,
        history,
        maintenance,
        trips,
        loading,
        error,
        notFound,
        reload,
        update,
    } = useVehicleDetail(vehicleId)

    const [editOpen, setEditOpen] = useState(false)
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
        setEditOpen(true)
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
            setEditOpen(false)
        } catch (err) {
            setFormError(
                err instanceof Error ? err.message : 'Failed to update vehicle',
            )
        } finally {
            setSaving(false)
        }
    }

    if (loading && !vehicle) {
        return (
            <PageContainer>
                <div className="flex justify-center py-24">
                    <Spinner size={40} />
                </div>
            </PageContainer>
        )
    }

    if (notFound) {
        return (
            <PageContainer>
                <PageHeader
                    title="Vehicle not found"
                    breadcrumbs={scmVehicleBreadcrumbs('Unknown')}
                    actions={
                        <Link href="/scm/vehicles">
                            <Button>Back to fleet</Button>
                        </Link>
                    }
                />
                <Alert showIcon type="warning" title="Not found">
                    This vehicle does not exist or was removed.
                </Alert>
            </PageContainer>
        )
    }

    if (!vehicle) {
        return (
            <PageContainer>
                {error ? (
                    <Alert showIcon type="danger" title="API error">
                        {error}
                    </Alert>
                ) : null}
            </PageContainer>
        )
    }

    const subtitle = `${vehicle.make} ${vehicle.model}${
        vehicle.year ? ` (${vehicle.year})` : ''
    } · ${formatStatusLabel(vehicle.type)}`

    return (
        <PageContainer>
            <PageHeader
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span>{vehicle.plateNumber}</span>
                        <StatusBadge tone={statusTone(vehicle.status)}>
                            {formatStatusLabel(vehicle.status)}
                        </StatusBadge>
                        {vehicle.routingBlocked ? (
                            <StatusBadge tone="danger">
                                Routing blocked
                            </StatusBadge>
                        ) : null}
                    </span>
                }
                description={subtitle}
                breadcrumbs={scmVehicleBreadcrumbs(vehicle.plateNumber)}
                actions={
                    <>
                        <Link href="/scm/vehicles">
                            <Button size="sm">Back to fleet</Button>
                        </Link>
                        <Link href="/scm/tracking">
                            <Button size="sm">Open tracking map</Button>
                        </Link>
                        <Button size="sm" variant="solid" onClick={openEdit}>
                            Edit vehicle
                        </Button>
                        <Button
                            size="sm"
                            loading={loading}
                            onClick={() => void reload()}
                        >
                            Refresh
                        </Button>
                    </>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard>
                <Tabs defaultValue="overview">
                    <TabList>
                        <TabNav value="overview">Overview</TabNav>
                        <TabNav value="telematics">Telematics</TabNav>
                        <TabNav value="maintenance">Maintenance</TabNav>
                        <TabNav value="trips">Trips</TabNav>
                    </TabList>

                    <div className="mt-6">
                        <TabContent value="overview">
                            <div className="space-y-4">
                                <VehicleOverviewPanel
                                    vehicle={vehicle}
                                    latest={latest}
                                    trips={trips}
                                />
                                <CurrentCargoPanel vehicleId={vehicle.id} />
                            </div>
                        </TabContent>
                        <TabContent value="telematics">
                            <VehicleTelematicsPanel
                                latest={latest}
                                history={history}
                            />
                        </TabContent>
                        <TabContent value="maintenance">
                            <VehicleMaintenancePanel records={maintenance} />
                        </TabContent>
                        <TabContent value="trips">
                            <VehicleTripsPanel trips={trips} />
                        </TabContent>
                    </div>
                </Tabs>
            </AdaptiveCard>

            <Dialog
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                onRequestClose={() => setEditOpen(false)}
                width={640}
            >
                <h5 className="mb-4">Edit vehicle</h5>
                {formError ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {formError}
                    </Alert>
                ) : null}
                <Form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void onSave()
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                        type: option?.value ?? 'TRUCK',
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
                                        status: option?.value ?? 'AVAILABLE',
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
                                        telematicsDeviceId: e.target.value,
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
                                        maintenanceThresholdKm: e.target.value,
                                    }))
                                }
                            />
                        </FormItem>
                        <FormItem label="Notes">
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
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                        <Button
                            type="button"
                            onClick={() => setEditOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            type="submit"
                            loading={saving}
                        >
                            Save
                        </Button>
                    </div>
                </Form>
            </Dialog>
        </PageContainer>
    )
}
