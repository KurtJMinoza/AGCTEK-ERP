import type { PrismaClient } from '@prisma/client'

/**
 * Clears SCM operational + fleet demo data so MM→SCM can be reseeded cleanly.
 * Does not delete Users (driver01 may be re-linked).
 */
export async function purgeSupplyChainData(prisma: PrismaClient) {
    console.log('Purging SCM data (trips, shipments, GPS, fleet, forecasts) …')

    const tripStopShipments = await prisma.tripStopShipment.deleteMany({})
    const tripStops = await prisma.tripStop.deleteMany({})
    const trips = await prisma.trip.deleteMany({})
    const geofenceEvents = await prisma.geofenceEvent.deleteMany({})
    const gps = await prisma.gpsLog.deleteMany({})
    const shipments = await prisma.shipment.deleteMany({})
    const maintenance = await prisma.maintenanceRecord.deleteMany({})
    const vehicleDocs = await prisma.vehicleDocument.deleteMany({})
    const geofences = await prisma.geofence.deleteMany({})
    const forecasts = await prisma.demandForecast.deleteMany({})
    const vehicles = await prisma.vehicle.deleteMany({})
    const drivers = await prisma.driver.deleteMany({})

    await prisma.scmPlanningSettings.deleteMany({})

    console.log(
        `  SCM purge: trips=${trips.count}, stops=${tripStops.count}, ` +
            `stopShipments=${tripStopShipments.count}, shipments=${shipments.count}, ` +
            `gps=${gps.count}, geofenceEvents=${geofenceEvents.count}, ` +
            `maintenance=${maintenance.count}, vehicleDocs=${vehicleDocs.count}, ` +
            `geofences=${geofences.count}, forecasts=${forecasts.count}, ` +
            `vehicles=${vehicles.count}, drivers=${drivers.count}`,
    )
    console.log('SCM purge complete.')
}
