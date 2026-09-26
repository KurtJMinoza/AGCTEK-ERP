import {
    Controller,
    Get,
    Post,
    Query,
    Param,
    Body,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { DashboardKpiService } from './dashboard-kpi.service'
import { DashboardAlertService } from './dashboard-alert.service'
import { DashboardAnalyticsService } from './dashboard-analytics.service'
import { DashboardVisibilityService } from './dashboard-visibility.service'
import { DashboardQueryDto, DashboardRefreshDto } from './dto/dashboard.dto'
import { DashboardFilters } from './dashboard.helpers'

@Controller('mm/dashboard')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DashboardController {
    constructor(
        private kpiService: DashboardKpiService,
        private alertService: DashboardAlertService,
        private analyticsService: DashboardAnalyticsService,
        private visibilityService: DashboardVisibilityService,
    ) {}

    @Get()
    async getDashboard(@Query() query: DashboardQueryDto) {
        return this.buildDashboard(query)
    }

    /** Canonical MM dashboard alias — same payload as GET /mm/dashboard. */
    @Get('mm')
    async getMmDashboard(@Query() query: DashboardQueryDto) {
        return this.buildDashboard(query)
    }

    @Get('kpis')
    async getKpis(@Query() query: DashboardQueryDto) {
        const filters = this.toFilters(query)
        const visibility = this.visibilityService.getVisibility(query.role, query.authority)
        const kpis = await this.kpiService.getKpis(filters)
        return this.applyKpiVisibility(kpis, visibility)
    }

    @Get('alerts')
    async getAlerts(@Query() query: DashboardQueryDto) {
        const visibility = this.visibilityService.getVisibility(query.role, query.authority)
        const alerts = await this.alertService.getAlerts(this.toFilters(query))
        return this.alertService.filterByVisibility(alerts, visibility)
    }

    @Get('analytics/:type')
    getAnalytics(@Param('type') type: string, @Query() query: DashboardQueryDto) {
        return this.analyticsService.getAnalytics(type, this.toFilters(query))
    }

    @Post('refresh')
    refresh(@Body() body: DashboardRefreshDto) {
        return this.analyticsService.refresh(this.toFilters(body))
    }

    private async buildDashboard(query: DashboardQueryDto) {
        const filters = this.toFilters(query)
        const visibility = this.visibilityService.getVisibility(query.role, query.authority)
        const includeAnalytics = query.includeAnalytics !== false

        const [kpis, rawAlerts, analytics] = await Promise.all([
            this.kpiService.getKpis(filters),
            this.alertService.getAlerts(filters),
            includeAnalytics && visibility.analytics
                ? this.analyticsService.getSummaries(filters)
                : Promise.resolve(null),
        ])

        return {
            filters,
            visibility,
            kpis: this.applyKpiVisibility(kpis, visibility),
            alerts: this.alertService.filterByVisibility(rawAlerts, visibility),
            analytics,
        }
    }

    private applyKpiVisibility(
        kpis: Awaited<ReturnType<DashboardKpiService['getKpis']>>,
        visibility: ReturnType<DashboardVisibilityService['getVisibility']>,
    ) {
        return {
            inventory: visibility.inventory ? kpis.inventory : [],
            procurement: visibility.procurement ? kpis.procurement : [],
            receiving: visibility.warehouse ? kpis.receiving : [],
            warehouse: visibility.warehouse ? kpis.warehouse : [],
            control: visibility.inventory ? kpis.control : [],
            suppliers: visibility.procurement ? kpis.suppliers : [],
        }
    }

    private toFilters(q: DashboardQueryDto | DashboardRefreshDto): DashboardFilters {
        return {
            companyId: q.companyId,
            warehouseId: q.warehouseId,
            branchId: q.branchId,
            materialCategoryId: q.materialCategoryId,
            supplierId: q.supplierId,
            dateFrom: q.dateFrom,
            dateTo: q.dateTo,
            deadStockDays: q.deadStockDays,
            agingBuckets: q.agingBuckets,
        }
    }
}
