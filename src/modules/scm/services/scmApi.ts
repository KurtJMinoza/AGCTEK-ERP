import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    Driver,
    FleetTrackingResponse,
    GpsLog,
    ListParams,
    MaintenanceRecord,
    Paginated,
    PlaceSuggestion,
    ScmDashboardSummary,
    ScmPlanningSettings,
    Shipment,
    Trip,
    CreateTripInput,
    Vehicle,
    VehicleCargoResponse,
} from '../types'
import type { GeofenceZone } from '../utils/geofences'
import type { GeocodeResult } from '../utils/geocode'

function toQuery(params?: ListParams) {
    if (!params) return undefined
    const query: Record<string, string | number> = {}
    if (params.page != null) query.page = params.page
    if (params.pageSize != null) query.pageSize = params.pageSize
    if (params.status) query.status = params.status
    if (params.search) query.search = params.search
    if (params.vehicleId) query.vehicleId = params.vehicleId
    if (params.movementType) query.movementType = params.movementType
    if (params.type) query.type = params.type
    return query
}

export async function apiGetVehicles(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<Vehicle>>('/scm/vehicles', {
        params: toQuery(params),
    })
    return data
}

export async function apiGetVehicle(id: string) {
    const { data } = await ErpAxiosBase.get<Vehicle>(`/scm/vehicles/${id}`)
    return data
}

export async function apiGetVehicleCargo(id: string) {
    const { data } = await ErpAxiosBase.get<VehicleCargoResponse>(
        `/scm/vehicles/${id}/cargo`,
    )
    return data
}

export async function apiCreateVehicle(body: Partial<Vehicle>) {
    const { data } = await ErpAxiosBase.post<Vehicle>('/scm/vehicles', body)
    return data
}

export async function apiUpdateVehicle(id: string, body: Partial<Vehicle>) {
    const { data } = await ErpAxiosBase.patch<Vehicle>(
        `/scm/vehicles/${id}`,
        body,
    )
    return data
}

export async function apiDeleteVehicle(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/vehicles/${id}`,
    )
    return data
}

export async function apiGetDrivers(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<Driver>>('/scm/drivers', {
        params: toQuery(params),
    })
    return data
}

export async function apiGetDriver(id: string) {
    const { data } = await ErpAxiosBase.get<Driver>(`/scm/drivers/${id}`)
    return data
}

export type CreateDriverBody = {
    userId: string
    firstName: string
    lastName: string
    licenseNumber: string
    licenseExpiry: string
    phone: string
    employeeCode?: string | null
    status?: Driver['status']
}

export async function apiCreateDriver(body: CreateDriverBody) {
    const { data } = await ErpAxiosBase.post<Driver>('/scm/drivers', body)
    return data
}

export async function apiUpdateDriver(
    id: string,
    body: Partial<Omit<CreateDriverBody, 'userId'>>,
) {
    const { data } = await ErpAxiosBase.patch<Driver>(
        `/scm/drivers/${id}`,
        body,
    )
    return data
}

export async function apiDeleteDriver(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/drivers/${id}`,
    )
    return data
}

/** Resolve ERP user id from username (for linking Driver.userId). */
export async function apiGetAuthProfile(userName: string) {
    const { data } = await ErpAxiosBase.get<{
        id: string
        email: string
        userName: string
        role: string
    }>('/auth/profile', { params: { userName } })
    return data
}

export async function apiGetShipments(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<Shipment>>(
        '/scm/shipments',
        { params: toQuery(params) },
    )
    return data
}

export async function apiCreateShipment(body: Partial<Shipment>) {
    const { data } = await ErpAxiosBase.post<Shipment>('/scm/shipments', body)
    return data
}

export async function apiDeleteShipment(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/shipments/${id}`,
    )
    return data
}

export async function apiAssignLoad(body: {
    vehicleId: string
    shipmentIds: string[]
    tripId?: string
    forceNewTrip?: boolean
    driverId?: string | null
    tripCode?: string
    plannedStartAt?: string | null
    notes?: string | null
    /** draft → Trip DRAFT; approve → Trip PLANNED (ready for dispatch) */
    planMode?: 'draft' | 'approve'
    /** Delivery stop order keys (destAddress lowercased) */
    stopOrder?: string[]
}) {
    const { data } = await ErpAxiosBase.post<Trip>(
        '/scm/trips/assign-load',
        body,
    )
    return data
}

export async function apiGetTrips(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<Trip>>('/scm/trips', {
        params: toQuery(params),
    })
    return data
}

export async function apiGetTrip(id: string) {
    const { data } = await ErpAxiosBase.get<Trip>(`/scm/trips/${id}`)
    return data
}

export async function apiCreateTrip(body: CreateTripInput) {
    const { data } = await ErpAxiosBase.post<Trip>('/scm/trips', body)
    return data
}

export async function apiUpdateTrip(id: string, body: Record<string, unknown>) {
    const { data } = await ErpAxiosBase.patch<Trip>(`/scm/trips/${id}`, body)
    return data
}

export async function apiUpdateTripStatus(id: string, status: string) {
    const { data } = await ErpAxiosBase.patch<Trip>(`/scm/trips/${id}/status`, {
        status,
    })
    return data
}

export async function apiDeleteTrip(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/trips/${id}`,
    )
    return data
}

export async function apiGetFleetTracking(params?: {
    status?: string
    search?: string
}) {
    const { data } = await ErpAxiosBase.get<FleetTrackingResponse>(
        '/scm/tracking/fleet',
        { params },
    )
    return data
}

export async function apiGetTrackingLatest(vehicleId: string) {
    const { data } = await ErpAxiosBase.get<GpsLog | null>(
        `/scm/tracking/vehicles/${vehicleId}/latest`,
    )
    return data
}

export async function apiGetTrackingHistory(
    vehicleId: string,
    params?: { from?: string; to?: string; limit?: number },
) {
    const { data } = await ErpAxiosBase.get<GpsLog[]>(
        `/scm/tracking/vehicles/${vehicleId}/history`,
        { params },
    )
    return data
}

/** Doc-aligned aliases (Live Telematics → map). */
export const getVehicleLivePosition = apiGetTrackingLatest
export const getVehicleGpsHistory = apiGetTrackingHistory

export async function apiGetMaintenance(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<MaintenanceRecord>>(
        '/scm/maintenance',
        { params: toQuery(params) },
    )
    return data
}

export type CreateMaintenanceBody = {
    vehicleId: string
    type: MaintenanceRecord['type']
    status?: MaintenanceRecord['status']
    title: string
    description?: string | null
    odometerKm?: number | null
    cost?: number | null
    scheduledAt: string
    completedAt?: string | null
    blocksRouting?: boolean
}

export async function apiCreateMaintenance(body: CreateMaintenanceBody) {
    const { data } = await ErpAxiosBase.post<MaintenanceRecord>(
        '/scm/maintenance',
        body,
    )
    return data
}

export async function apiUpdateMaintenance(
    id: string,
    body: Partial<CreateMaintenanceBody>,
) {
    const { data } = await ErpAxiosBase.patch<MaintenanceRecord>(
        `/scm/maintenance/${id}`,
        body,
    )
    return data
}

export async function apiDeleteMaintenance(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/maintenance/${id}`,
    )
    return data
}

export type SetOdometerThresholdsBody = {
    /** Absolute odometer km target; null clears auto-due. */
    thresholdKm: number | null
    /** Omit or empty = all vehicles. */
    vehicleIds?: string[]
}

export type SetOdometerThresholdsResult = {
    updated: number
    thresholdKm: number | null
    dueOpened: number
    scope: 'all' | 'selected'
}

export async function apiSetOdometerThresholds(
    body: SetOdometerThresholdsBody,
) {
    const { data } = await ErpAxiosBase.put<SetOdometerThresholdsResult>(
        '/scm/maintenance/odometer-thresholds',
        body,
    )
    return data
}

export async function apiGetGeofences(params?: ListParams & { kind?: string; active?: string }) {
    const { data } = await ErpAxiosBase.get<Paginated<GeofenceZone>>(
        '/scm/geofences',
        {
            params: {
                ...toQuery(params),
                ...(params?.kind ? { kind: params.kind } : {}),
                ...(params?.active ? { active: params.active } : {}),
            },
        },
    )
    return data
}

export async function apiCreateGeofence(body: Partial<GeofenceZone>) {
    const { data } = await ErpAxiosBase.post<GeofenceZone>(
        '/scm/geofences',
        body,
    )
    return data
}

export async function apiUpdateGeofence(
    id: string,
    body: Partial<GeofenceZone>,
) {
    const { data } = await ErpAxiosBase.patch<GeofenceZone>(
        `/scm/geofences/${id}`,
        body,
    )
    return data
}

export async function apiDeleteGeofence(id: string) {
    const { data } = await ErpAxiosBase.delete<{ ok: boolean }>(
        `/scm/geofences/${id}`,
    )
    return data
}

/**
 * Photon-backed place autocomplete via Nest proxy.
 * Provider URL is server-side (PLACES_PROVIDER_URL / PHOTON_URL).
 */
export async function apiSearchPlaces(params: {
    q: string
    limit?: number
    country?: string
}) {
    const { data } = await ErpAxiosBase.get<PlaceSuggestion[]>(
        '/scm/places/search',
        {
            params: {
                q: params.q,
                limit: params.limit ?? 5,
                ...(params.country ? { country: params.country } : {}),
            },
        },
    )
    return data
}

/** @deprecated Prefer apiSearchPlaces / LocationSearchField for address UX. */
export async function apiGeocodeSearch(q: string, limit = 5) {
    const { data } = await ErpAxiosBase.get<{ data: GeocodeResult[] }>(
        '/scm/geocode/search',
        { params: { q, limit } },
    )
    return data.data
}

export async function apiGeocodeReverse(lat: number, lng: number) {
    const { data } = await ErpAxiosBase.get<{
        displayName: string | null
        lat: number
        lng: number
    }>('/scm/geocode/reverse', { params: { lat, lng } })
    return data
}

export async function apiGetPlanningSettings() {
    const { data } = await ErpAxiosBase.get<ScmPlanningSettings>(
        '/scm/planning-settings',
    )
    return data
}

export async function apiUpdatePlanningSettings(
    body: Partial<
        Pick<
            ScmPlanningSettings,
            'horizonWeeks' | 'bucketSize' | 'frozenZoneDays'
        >
    >,
) {
    const { data } = await ErpAxiosBase.put<ScmPlanningSettings>(
        '/scm/planning-settings',
        body,
    )
    return data
}

export async function apiGetScmDashboardSummary() {
    const { data } = await ErpAxiosBase.get<ScmDashboardSummary>(
        '/scm/dashboard/summary',
    )
    return data
}
