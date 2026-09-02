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
import { MaintenanceController } from './maintenance/maintenance.controller'
import { MaintenanceService } from './maintenance/maintenance.service'

@Module({
    controllers: [
        VehiclesController,
        DriversController,
        ShipmentsController,
        TripsController,
        TrackingController,
        MaintenanceController,
    ],
    providers: [
        VehiclesService,
        DriversService,
        ShipmentsService,
        TripsService,
        TrackingService,
        MaintenanceService,
    ],
})
export class ScmModule {}
