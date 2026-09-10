import { Module } from '@nestjs/common'
import { VehiclesController } from './vehicles/vehicles.controller'
import { VehiclesService } from './vehicles/vehicles.service'
import { DriversController } from './drivers/drivers.controller'
import { DriversService } from './drivers/drivers.service'
import { ShipmentsController } from './shipments/shipments.controller'
import { ShipmentsService } from './shipments/shipments.service'
import { TripsController } from './trips/trips.controller'
import { TripsService } from './trips/trips.service'
import { TrackingController } from './tracking/tracking.controller'
import { TrackingService } from './tracking/tracking.service'
import { TrackingGateway } from './tracking/tracking.gateway'
import { FlespiMqttService } from './tracking/flespi-mqtt.service'
import { MaintenanceController } from './maintenance/maintenance.controller'
import { MaintenanceService } from './maintenance/maintenance.service'
import { Tile38Service } from './tile38/tile38.service'
import { GeofencesController } from './geofences/geofences.controller'
import { GeofencesService } from './geofences/geofences.service'
import { GeocodeController } from './geocode/geocode.controller'
import { PlacesController } from './places/places.controller'
import { PlacesService } from './places/places.service'
import { PlanningSettingsController } from './planning-settings/planning-settings.controller'
import { PlanningSettingsService } from './planning-settings/planning-settings.service'
import { DashboardController } from './dashboard/dashboard.controller'
import { DashboardService } from './dashboard/dashboard.service'

@Module({
    controllers: [
        VehiclesController,
        DriversController,
        ShipmentsController,
        TripsController,
        TrackingController,
        MaintenanceController,
        GeofencesController,
        GeocodeController,
        PlacesController,
        PlanningSettingsController,
        DashboardController,
    ],
    providers: [
        VehiclesService,
        DriversService,
        ShipmentsService,
        TripsService,
        TrackingService,
        TrackingGateway,
        FlespiMqttService,
        MaintenanceService,
        Tile38Service,
        GeofencesService,
        PlacesService,
        PlanningSettingsService,
        DashboardService,
    ],
})
export class ScmModule {}
