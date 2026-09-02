import ErpAxiosBase from '@/services/axios/ErpAxiosBase'
import type {
    Driver,
    GpsLog,
    ListParams,
    MaintenanceRecord,
    Paginated,
    Shipment,
    Trip,
    Vehicle,
} from '../types'

function toQuery(params?: ListParams) {
    if (!params) return undefined
    const query: Record<string, string | number> = {}
    if (params.page != null) query.page = params.page
    if (params.pageSize != null) query.pageSize = params.pageSize
    if (params.status) query.status = params.status
    if (params.search) query.search = params.search
    if (params.vehicleId) query.vehicleId = params.vehicleId
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

export async function apiGetShipments(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<Shipment>>(
        '/scm/shipments',
        { params: toQuery(params) },
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

export async function apiCreateTrip(body: Record<string, unknown>) {
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

export async function apiGetMaintenance(params?: ListParams) {
    const { data } = await ErpAxiosBase.get<Paginated<MaintenanceRecord>>(
        '/scm/maintenance',
        { params: toQuery(params) },
    )
    return data
}
