import { Module, forwardRef } from '@nestjs/common'
import { VehiclesController } from './vehicles/vehicles.controller'
import { VehiclesService } from './vehicles/vehicles.service'
import { DriversController } from './drivers/drivers.controller'
import { DriversService } from './drivers/drivers.service'
import { ShipmentsController } from './shipments/shipments.controller'
import { ShipmentsService } from './shipments/shipments.service'
import { DamageReportsController } from './damage-reports/damage-reports.controller'
import { DamageReportsService } from './damage-reports/damage-reports.service'
import { TripsController } from './trips/trips.controller'
import { TripsService } from './trips/trips.service'
import { TrackingController } from './tracking/tracking.controller'
import { TrackingService } from './tracking/tracking.service'
import { TrackingGateway } from './tracking/tracking.gateway'
import { FlespiMqttService } from './tracking/flespi-mqtt.service'
import { MaintenanceController } from './maintenance/maintenance.controller'
import { MaintenanceService } from './maintenance/maintenance.service'
import { VehicleDocumentsService } from './maintenance/vehicle-documents.service'
import { VehicleDocumentsController } from './documents/vehicle-documents.controller'
import { Tile38Service } from './tile38/tile38.service'
import { GeofencesController } from './geofences/geofences.controller'
import { GeofencesService } from './geofences/geofences.service'
import { GeocodeController } from './geocode/geocode.controller'
import { PlacesController } from './places/places.controller'
import { PlacesService } from './places/places.service'
import { DashboardController } from './dashboard/dashboard.controller'
import { DashboardService } from './dashboard/dashboard.service'
import { DemandPlanController } from './demand-plan/demand-plan.controller'
import { DemandPlanService } from './demand-plan/demand-plan.service'
import { DemandSalesService } from './demand-plan/demand-plan.sales'
import { TmsController } from './tms/tms.controller'
import { TmsLoadPlansService } from './tms/tms-load-plans.service'
import { TmsTripsService } from './tms/tms-trips.service'
import { TmsRoutePreviewService } from './tms/tms-route-preview.service'
import { OsrmService } from './routing/osrm.service'
import { GeocodeService } from './geocode/geocode.service'
import { MmModule } from '../mm/mm.module'
import { SdModule } from '../sd/sd.module'

@Module({
    imports: [forwardRef(() => MmModule), forwardRef(() => SdModule)],
    controllers: [
        VehiclesController,
        DriversController,
        ShipmentsController,
        DamageReportsController,
        TripsController,
        TrackingController,
        MaintenanceController,
        VehicleDocumentsController,
        GeofencesController,
        GeocodeController,
        PlacesController,
        DashboardController,
        DemandPlanController,
        TmsController,
    ],
    providers: [
        VehiclesService,
        DriversService,
        ShipmentsService,
        DamageReportsService,
        TripsService,
        TrackingService,
        TrackingGateway,
        FlespiMqttService,
        MaintenanceService,
        VehicleDocumentsService,
        Tile38Service,
        GeofencesService,
        PlacesService,
        DashboardService,
        DemandPlanService,
        DemandSalesService,
        TmsLoadPlansService,
        TmsTripsService,
        TmsRoutePreviewService,
        OsrmService,
        GeocodeService,
    ],
    exports: [ShipmentsService, PlacesService, GeocodeService],
})
export class ScmModule {}
