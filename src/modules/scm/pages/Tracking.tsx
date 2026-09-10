'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import ScrollBar from '@/components/ui/ScrollBar'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import FleetMapPanel from '../components/tracking/FleetMapPanel'
import GeofenceEditorDialog from '../components/tracking/GeofenceEditorDialog'
import TrackingFleetList from '../components/tracking/TrackingFleetList'
import TrackingStatsBar from '../components/tracking/TrackingStatsBar'
import TrackingStatusChips from '../components/tracking/TrackingStatusChips'
import TrackingUnitCallout from '../components/tracking/TrackingUnitCallout'
import { useFleetTracking } from '../hooks/useFleetTracking'
import { useFocusedVehicleTrail } from '../hooks/useFocusedVehicleTrail'
import { useGeofences } from '../hooks/useGeofences'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { computeTrackingMetrics } from '../utils/trackingMetrics'
import type { GeofenceZone } from '../utils/geofences'
import { formatStatusLabel } from '../utils/status'

type Option = { value: string; label: string }

const statusOptions: Option[] = [
    { value: '', label: 'All statuses' },
    { value: 'AVAILABLE', label: 'Available' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'MAINTENANCE', label: 'Maintenance' },
    { value: 'OUT_OF_SERVICE', label: 'Out of Service' },
    { value: 'INACTIVE', label: 'Inactive' },
]

/**
 * GPS Fleet Map + Tile38 geofencing (SCM telematics / last-mile visibility).
 */
export default function TrackingPage() {
    const {
        items,
        selected,
        selectedVehicleId,
        setSelectedVehicleId,
        toggleSelectVehicle,
        filters,
        setFilters,
        loading,
        error,
        reload,
        liveStatus,
        liveTransport,
        liveTrail,
    } = useFleetTracking()

    const geofences = useGeofences()
    const { history } = useFocusedVehicleTrail(selectedVehicleId, liveTrail)
    const [centerRequest, setCenterRequest] = useState(0)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editing, setEditing] = useState<GeofenceZone | null>(null)

    const metrics = useMemo(
        () => computeTrackingMetrics(selected, history),
        [selected, history],
    )

    const withGpsCount = items.filter((item) => item.latest).length

    return (
        <PageContainer>
            <PageHeader
                title="Live Tracking"
                description="Live GPS via Socket.IO — pins update as flespi pings arrive; select a unit for trail and trip context."
                breadcrumbs={scmPageBreadcrumbs('Tracking')}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            onClick={() => {
                                setEditing(null)
                                setEditorOpen(true)
                            }}
                        >
                            Add hub / geofence
                        </Button>
                        <Button
                            size="sm"
                            loading={loading}
                            onClick={() => void reload()}
                        >
                            Refresh
                        </Button>
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            {geofences.error ? (
                <Alert
                    showIcon
                    type="warning"
                    className="mb-4"
                    title="Geofences"
                >
                    {geofences.error}
                </Alert>
            ) : null}

            <AdaptiveCard className="relative z-20 mb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <Input
                        className="md:max-w-xs"
                        placeholder="Search plate, code, make…"
                        value={filters.search ?? ''}
                        onChange={(e) =>
                            setFilters((current) => ({
                                ...current,
                                search: e.target.value,
                            }))
                        }
                    />
                    <Select
                        className="md:w-56"
                        options={statusOptions}
                        menuPosition="fixed"
                        styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 60 }),
                            menu: (base) => ({ ...base, zIndex: 60 }),
                        }}
                        value={
                            statusOptions.find(
                                (option) =>
                                    option.value === (filters.status ?? ''),
                            ) ?? statusOptions[0]
                        }
                        onChange={(option) =>
                            setFilters((current) => ({
                                ...current,
                                status: (option?.value ??
                                    '') as typeof current.status,
                            }))
                        }
                    />
                    <div className="lg:ml-auto">
                        <TrackingStatusChips
                            plateNumber={selected?.vehicle.plateNumber}
                            fixQuality={metrics.gpsFixQuality}
                            speedKmh={metrics.currentSpeedKmh}
                            liveStatus={liveStatus}
                            liveTransport={liveTransport}
                        />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {withGpsCount}/{items.length} with GPS ·{' '}
                        {geofences.data.length} geofences
                    </p>
                </div>
            </AdaptiveCard>

            <div className="relative z-0 grid grid-cols-1 gap-4 xl:grid-cols-12">
                <AdaptiveCard
                    className="xl:col-span-3"
                    bodyClass="flex h-full flex-col p-0"
                >
                    <TrackingFleetList
                        items={items}
                        selectedVehicleId={selectedVehicleId}
                        loading={loading}
                        onSelect={toggleSelectVehicle}
                    />
                    <div className="border-t border-gray-200 dark:border-gray-700">
                        <div className="px-4 py-2">
                            <h6 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Hubs / geofences
                            </h6>
                        </div>
                        <ScrollBar className="max-h-48">
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {geofences.data.map((zone) => (
                                    <li
                                        key={zone.id}
                                        className="flex items-center justify-between gap-2 px-4 py-2"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {zone.name}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {zone.code} ·{' '}
                                                {formatStatusLabel(zone.kind)} ·{' '}
                                                {zone.radiusM} m
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-1">
                                            <Button
                                                size="xs"
                                                onClick={() => {
                                                    setEditing(zone)
                                                    setEditorOpen(true)
                                                }}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                className="text-red-600"
                                                onClick={() =>
                                                    void geofences.remove(
                                                        zone.id,
                                                    )
                                                }
                                            >
                                                Del
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                                {geofences.data.length === 0 &&
                                !geofences.loading ? (
                                    <li className="px-4 py-6 text-center text-xs text-gray-500">
                                        No geofences yet — add a hub to sync
                                        into Tile38.
                                    </li>
                                ) : null}
                            </ul>
                        </ScrollBar>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard
                    className="xl:col-span-6"
                    bodyClass="h-full min-h-[480px] p-2"
                >
                    <FleetMapPanel
                        items={items}
                        selectedVehicleId={selectedVehicleId}
                        onSelect={(id) => setSelectedVehicleId(id)}
                        history={history}
                        geofences={geofences.data}
                        centerRequest={centerRequest}
                    />
                </AdaptiveCard>

                <AdaptiveCard
                    className="xl:col-span-3"
                    bodyClass="flex h-full flex-col"
                >
                    <TrackingUnitCallout
                        item={selected}
                        onClear={() => setSelectedVehicleId(null)}
                        onCenter={() => {
                            if (selectedVehicleId) {
                                setCenterRequest((n) => n + 1)
                            }
                        }}
                    />
                    <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
                        <StatusBadge tone="info">Tile38</StatusBadge>
                        <p className="mt-2 text-xs text-gray-500">
                            GPS ingest updates fleet points in Tile38. Active
                            hubs register NEARBY FENCE hooks for enter/exit.
                        </p>
                    </div>
                </AdaptiveCard>
            </div>

            <div className="mt-4">
                <TrackingStatsBar metrics={metrics} />
            </div>

            <GeofenceEditorDialog
                isOpen={editorOpen}
                initial={editing}
                onClose={() => {
                    setEditorOpen(false)
                    setEditing(null)
                }}
                onSave={async (body) => {
                    if (editing) {
                        await geofences.update(editing.id, body)
                    } else {
                        await geofences.create(body)
                    }
                }}
            />
        </PageContainer>
    )
}
