import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    FicoAuditQueryDto,
    FicoChartCreateDto,
    FicoChartDuplicateDto,
    FicoChartUpdateDto,
    FicoCompanyGlAccountDto,
    FicoCompanySettingsUpsertDto,
    FicoFiscalVariantCreateDto,
    FicoFiscalVariantDuplicateDto,
    FicoFiscalVariantUpdateDto,
    FicoFiscalYearGenerateDto,
    FicoFiscalYearPreviewDto,
    FicoGlAccountCreateDto,
    FicoGlAccountImportDto,
    FicoGlAccountUpdateDto,
    FicoGlGroupCreateDto,
    FicoGlGroupUpdateDto,
    FicoListQueryDto,
    FicoPeriodActionDto,
    FicoPeriodListQueryDto,
    FicoPeriodResolveQueryDto,
    FicoPostingVariantCreateDto,
    FicoPostingVariantUpdateDto,
    FicoPostingValidationDto,
    FicoReasonDto,
} from './dto/fico-phase1.dto'
import { FicoAuditService } from './fico-audit.service'
import { FicoChartOfAccountsService } from './fico-chart-of-accounts.service'
import { FicoCompanyAccessService } from './fico-company-access.service'
import { FicoCompanySettingsService } from './fico-company-settings.service'
import { FicoFiscalCalendarService } from './fico-fiscal-calendar.service'
import { FicoGlAccountsService } from './fico-gl-accounts.service'
import { FicoOverviewService } from './fico-overview.service'
import { FicoPostingPeriodService } from './fico-posting-period.service'
import { FicoPostingValidationService } from './fico-posting-validation.service'

@Controller('fico')
export class FicoPhase1Controller {
    constructor(
        private readonly settings: FicoCompanySettingsService,
        private readonly charts: FicoChartOfAccountsService,
        private readonly accounts: FicoGlAccountsService,
        private readonly calendar: FicoFiscalCalendarService,
        private readonly periods: FicoPostingPeriodService,
        private readonly validation: FicoPostingValidationService,
        private readonly overview: FicoOverviewService,
        private readonly audit: FicoAuditService,
        private readonly access: FicoCompanyAccessService,
    ) {}

    @Get('overview')
    @RequirePermission('fico.overview', 'read')
    getOverview(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.overview.overview(companyId, user)
    }

    // ---------------------------------------------------------------------
    // Company accounting settings
    // ---------------------------------------------------------------------

    @Get('company-settings/companies')
    @RequirePermission('fico.company-settings', 'read')
    listCompanies(@CurrentUser() user: AuthRequestUser) {
        return this.settings.listCompanies(user)
    }

    @Get('company-settings/defaults')
    @RequirePermission('fico.company-settings', 'read')
    defaults() {
        return this.settings.defaults()
    }

    @Get('company-settings/:companyId')
    @RequirePermission('fico.company-settings', 'read')
    getSettings(
        @Param('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.get(companyId, user)
    }

    @Post('company-settings/:companyId')
    @RequirePermission('fico.company-settings', 'create')
    createSettings(
        @Param('companyId') companyId: string,
        @Body() dto: FicoCompanySettingsUpsertDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.create(companyId, dto, user)
    }

    @Put('company-settings/:companyId')
    @RequirePermission('fico.company-settings', 'update')
    updateSettings(
        @Param('companyId') companyId: string,
        @Body() dto: FicoCompanySettingsUpsertDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.update(companyId, dto, user)
    }

    @Post('company-settings/:companyId/validate')
    @RequirePermission('fico.company-settings', 'read')
    validateSettings(
        @Param('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.validate(companyId, user)
    }

    @Post('company-settings/:companyId/activate')
    @RequirePermission('fico.company-settings', 'update')
    activateSettings(
        @Param('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.activate(companyId, user)
    }

    @Post('company-settings/:companyId/deactivate')
    @RequirePermission('fico.company-settings', 'update')
    deactivateSettings(
        @Param('companyId') companyId: string,
        @Body() dto: FicoReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.settings.deactivate(companyId, user, dto.reason)
    }

    // ---------------------------------------------------------------------
    // Chart of accounts and account groups
    // ---------------------------------------------------------------------

    @Get('chart-of-accounts')
    @RequirePermission('fico.chart-of-accounts', 'read')
    listCharts(@Query() query: FicoListQueryDto) {
        return this.charts.list(query)
    }

    @Post('chart-of-accounts')
    @RequirePermission('fico.chart-of-accounts', 'create')
    createChart(
        @Body() dto: FicoChartCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.create(dto, user)
    }

    @Get('chart-of-accounts/:id')
    @RequirePermission('fico.chart-of-accounts', 'read')
    getChart(@Param('id') id: string) {
        return this.charts.get(id)
    }

    @Patch('chart-of-accounts/:id')
    @RequirePermission('fico.chart-of-accounts', 'update')
    updateChart(
        @Param('id') id: string,
        @Body() dto: FicoChartUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.update(id, dto, user)
    }

    @Delete('chart-of-accounts/:id')
    @RequirePermission('fico.chart-of-accounts', 'delete')
    deleteChart(
        @Param('id') id: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.remove(id, user)
    }

    @Post('chart-of-accounts/:id/duplicate')
    @RequirePermission('fico.chart-of-accounts', 'create')
    duplicateChart(
        @Param('id') id: string,
        @Body() dto: FicoChartDuplicateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.duplicate(id, dto, user)
    }

    @Get('chart-of-accounts/:id/groups')
    @RequirePermission('fico.chart-of-accounts', 'read')
    listGroups(@Param('id') id: string) {
        return this.charts.listGroups(id)
    }

    @Post('chart-of-accounts/:id/groups')
    @RequirePermission('fico.chart-of-accounts', 'create')
    createGroup(
        @Param('id') id: string,
        @Body() dto: FicoGlGroupCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.createGroup(id, dto, user)
    }

    @Patch('chart-of-accounts/:id/groups/:groupId')
    @RequirePermission('fico.chart-of-accounts', 'update')
    updateGroup(
        @Param('id') id: string,
        @Param('groupId') groupId: string,
        @Body() dto: FicoGlGroupUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.updateGroup(id, groupId, dto, user)
    }

    @Delete('chart-of-accounts/:id/groups/:groupId')
    @RequirePermission('fico.chart-of-accounts', 'delete')
    deleteGroup(
        @Param('id') id: string,
        @Param('groupId') groupId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.charts.removeGroup(id, groupId, user)
    }

    // ---------------------------------------------------------------------
    // G/L accounts and company assignments
    // ---------------------------------------------------------------------

    @Get('gl-accounts')
    @RequirePermission('fico.gl-accounts', 'read')
    listAccounts(@Query() query: FicoListQueryDto) {
        return this.accounts.list(query)
    }

    @Post('gl-accounts')
    @RequirePermission('fico.gl-accounts', 'create')
    createAccount(
        @Body() dto: FicoGlAccountCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.create(dto, user)
    }

    @Post('gl-accounts/import')
    @RequirePermission('fico.gl-accounts', 'create')
    importAccounts(
        @Body() dto: FicoGlAccountImportDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.importAccounts(dto, user)
    }

    @Get('gl-accounts/companies/:companyId')
    @RequirePermission('fico.gl-accounts', 'read')
    listCompanyAssignments(
        @Param('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.listCompanyAssignments(companyId, user)
    }

    @Get('gl-accounts/:id')
    @RequirePermission('fico.gl-accounts', 'read')
    getAccount(@Param('id') id: string) {
        return this.accounts.get(id)
    }

    @Get('gl-accounts/:id/usage')
    @RequirePermission('fico.gl-accounts', 'read')
    getAccountUsage(
        @Param('id') id: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.usage(id, user)
    }

    @Patch('gl-accounts/:id')
    @RequirePermission('fico.gl-accounts', 'update')
    updateAccount(
        @Param('id') id: string,
        @Body() dto: FicoGlAccountUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.update(id, dto, user)
    }

    @Delete('gl-accounts/:id')
    @RequirePermission('fico.gl-accounts', 'delete')
    deleteAccount(
        @Param('id') id: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.remove(id, user)
    }

    @Put('gl-accounts/:id/companies/:companyId')
    @RequirePermission('fico.gl-accounts', 'update')
    upsertCompanyAssignment(
        @Param('id') id: string,
        @Param('companyId') companyId: string,
        @Body() dto: FicoCompanyGlAccountDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.upsertCompanyAssignment(
            id,
            companyId,
            dto,
            user,
        )
    }

    @Delete('gl-accounts/:id/companies/:companyId')
    @RequirePermission('fico.gl-accounts', 'delete')
    removeCompanyAssignment(
        @Param('id') id: string,
        @Param('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.accounts.removeCompanyAssignment(id, companyId, user)
    }

    // ---------------------------------------------------------------------
    // Fiscal calendar
    // ---------------------------------------------------------------------

    @Get('fiscal-years/variants')
    @RequirePermission('fico.periods', 'read')
    listFiscalVariants() {
        return this.calendar.listFiscalVariants()
    }

    @Post('fiscal-years/variants')
    @RequirePermission('fico.periods', 'create')
    createFiscalVariant(
        @Body() dto: FicoFiscalVariantCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.createFiscalVariant(dto, user)
    }

    @Patch('fiscal-years/variants/:id')
    @RequirePermission('fico.periods', 'update')
    updateFiscalVariant(
        @Param('id') id: string,
        @Body() dto: FicoFiscalVariantUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.updateFiscalVariant(id, dto, user)
    }

    @Post('fiscal-years/variants/:id/duplicate')
    @RequirePermission('fico.periods', 'create')
    duplicateFiscalVariant(
        @Param('id') id: string,
        @Body() dto: FicoFiscalVariantDuplicateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.duplicateFiscalVariant(id, dto, user)
    }

    @Post('fiscal-years/preview')
    @RequirePermission('fico.periods', 'read')
    previewFiscalYear(@Body() dto: FicoFiscalYearPreviewDto) {
        return this.calendar.previewFiscalYear(dto)
    }

    @Get('fiscal-years/posting-variants')
    @RequirePermission('fico.periods', 'read')
    listPostingVariants() {
        return this.calendar.listPostingVariants()
    }

    @Post('fiscal-years/posting-variants')
    @RequirePermission('fico.periods', 'create')
    createPostingVariant(
        @Body() dto: FicoPostingVariantCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.createPostingVariant(dto, user)
    }

    @Patch('fiscal-years/posting-variants/:id')
    @RequirePermission('fico.periods', 'update')
    updatePostingVariant(
        @Param('id') id: string,
        @Body() dto: FicoPostingVariantUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.updatePostingVariant(id, dto, user)
    }

    @Get('fiscal-years')
    @RequirePermission('fico.periods', 'read')
    listFiscalYears(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.listFiscalYears(companyId, user)
    }

    @Post('fiscal-years/generate')
    @RequirePermission('fico.periods', 'create')
    generateFiscalYear(
        @Body() dto: FicoFiscalYearGenerateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.calendar.generateFiscalYear(dto, user)
    }

    // ---------------------------------------------------------------------
    // Posting periods and centralized validation
    // ---------------------------------------------------------------------

    @Get('posting-periods')
    @RequirePermission('fico.periods', 'read')
    listPeriods(
        @Query() query: FicoPeriodListQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.access
            .assertAccess(user, query.companyId)
            .then(() => this.periods.list(query))
    }

    @Get('posting-periods/resolve')
    @RequirePermission('fico.periods', 'read')
    async resolvePeriod(
        @Query() query: FicoPeriodResolveQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, query.companyId)
        return this.periods.resolveQuery(
            query.companyId,
            new Date(query.postingDate),
        )
    }

    @Get('posting-periods/:id/history')
    @RequirePermission('fico.periods', 'read')
    periodHistory(
        @Param('id') id: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.history(id, user)
    }

    @Post('posting-periods/:id/open')
    @RequirePermission('fico.periods', 'update')
    openPeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'open', dto.reason, user)
    }

    @Post('posting-periods/:id/restrict')
    @RequirePermission('fico.periods', 'update')
    restrictPeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'restrict', dto.reason, user)
    }

    @Post('posting-periods/:id/close')
    @RequirePermission('fico.periods', 'update')
    closePeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'close', dto.reason, user)
    }

    @Post('posting-periods/:id/lock')
    @RequirePermission('fico.periods', 'update')
    lockPeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'lock', dto.reason, user)
    }

    @Post('posting-periods/:id/reopen')
    @RequirePermission('fico.period-reopen', 'update')
    reopenPeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'reopen', dto.reason, user)
    }

    @Post('posting-periods/:id/unlock')
    @RequirePermission('fico.period-unlock', 'update')
    unlockPeriod(
        @Param('id') id: string,
        @Body() dto: FicoPeriodActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.periods.transition(id, 'unlock', dto.reason, user)
    }

    @Post('posting-validation')
    @RequirePermission(['fico.journal-entries', 'fico.periods'], 'read')
    async validatePosting(
        @Body() dto: FicoPostingValidationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        await this.access.assertAccess(user, dto.companyId)
        return this.validation.validate(dto)
    }

    // ---------------------------------------------------------------------
    // Audit
    // ---------------------------------------------------------------------

    @Get('audit')
    @RequirePermission('fico.audit', 'read')
    async listAudit(
        @Query() query: FicoAuditQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (query.companyId) {
            await this.access.assertAccess(user, query.companyId)
        }
        return this.audit.list({
            ...query,
            dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
            dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        })
    }
}
