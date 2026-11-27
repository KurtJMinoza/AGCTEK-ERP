import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import type { AuthRequestUser } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    FicoAccountDeterminationBatchDto,
    FicoAccountDeterminationDto,
    FicoAccountResolutionDto,
    FicoDeterminationConflictCheckDto,
    FicoDeterminationExceptionQueryDto,
    FicoDeterminationNewVersionDto,
    FicoDeterminationReasonDto,
    FicoDeterminationRuleCreateDto,
    FicoDeterminationRuleQueryDto,
    FicoDeterminationRuleUpdateDto,
    FicoDeterminationSimulationDto,
    FicoDeterminationUsageQueryDto,
    FicoTransactionKeyWriteDto,
} from './dto/account-determination.dto'
import { FicoAccountDeterminationExceptionService } from './fico-account-determination-exception.service'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'
import { FicoTransactionKeyService } from './fico-transaction-key.service'
import { FicoMmMappingMigrationService } from './fico-mm-mapping-migration.service'
import { FicoAccountDeterminationSimulationService } from './fico-account-determination-simulation.service'

@Controller('fico/account-determination')
export class FicoAccountDeterminationController {
    constructor(
        private readonly rules: FicoAccountDeterminationRulesService,
        private readonly resolution: FicoAccountResolutionService,
        private readonly transactionKeys: FicoTransactionKeyService,
        private readonly mmMigration: FicoMmMappingMigrationService,
        private readonly simulation: FicoAccountDeterminationSimulationService,
        private readonly exceptions: FicoAccountDeterminationExceptionService,
    ) {}

    // ------------------------------------------------------------------
    // Reference data and summary
    // ------------------------------------------------------------------

    @Get('reference')
    @RequirePermission('fico.account-determination', 'read')
    reference(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.reference({ companyId }, user)
    }

    @Get('transaction-keys')
    @RequirePermission('fico.account-determination', 'read')
    async transactionKeyCatalog() {
        return {
            catalog: this.transactionKeys.catalog(),
            persisted: await this.transactionKeys.listPersisted(),
        }
    }

    @Post('transaction-keys/sync')
    @RequirePermission('fico.account-determination', 'update')
    syncTransactionKeys(@CurrentUser() user: AuthRequestUser) {
        return this.transactionKeys.syncCatalogFromCode(user)
    }

    @Post('transaction-keys')
    @RequirePermission('fico.account-determination', 'create')
    createTransactionKey(
        @Body() dto: FicoTransactionKeyWriteDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.transactionKeys.create(dto, user)
    }

    @Get('transaction-keys/:id')
    @RequirePermission('fico.account-determination', 'read')
    getTransactionKey(@Param('id') id: string) {
        return this.transactionKeys.getOne(id)
    }

    @Patch('transaction-keys/:id')
    @RequirePermission('fico.account-determination', 'update')
    updateTransactionKey(
        @Param('id') id: string,
        @Body() dto: FicoTransactionKeyWriteDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.transactionKeys.update(id, dto, user)
    }

    @Get('summary')
    @RequirePermission('fico.account-determination', 'read')
    overview(
        @Query() query: FicoDeterminationRuleQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.overview(query, user)
    }

    @Get('workbench/overview')
    @RequirePermission('fico.account-determination', 'read')
    workbenchOverview(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.rules.workbenchOverview(companyId, user)
    }

    /** Phase 04.26 canonical alias of `workbench/overview`. */
    @Get('overview')
    @RequirePermission('fico.account-determination', 'read')
    overviewMetrics(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.rules.workbenchOverview(companyId, user)
    }

    @Get('module-coverage')
    @RequirePermission('fico.account-determination', 'read')
    moduleCoverage(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.rules.moduleCoverage(companyId, user)
    }

    @Get('exceptions')
    @RequirePermission('fico.account-determination', 'read')
    listExceptions(
        @Query() query: FicoDeterminationExceptionQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.exceptions.list(query, user)
    }

    @Get('usage')
    @RequirePermission('fico.account-determination', 'read')
    usage(
        @Query() query: FicoDeterminationUsageQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.usage(query, user)
    }

    @Get('rules/history')
    @RequirePermission('fico.account-determination', 'read')
    configurationHistory(
        @Query() query: FicoDeterminationRuleQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.configurationHistory(query, user)
    }

    // ------------------------------------------------------------------
    // Resolution and rules
    // ------------------------------------------------------------------

    @Post('resolve')
    @RequirePermission('fico.account-determination', 'read')
    resolve(
        @Body() dto: FicoAccountResolutionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.resolveForUser(dto, user)
    }

    @Post('resolve-determination')
    @RequirePermission('fico.account-determination', 'read')
    async resolveDetermination(
        @Body() dto: FicoAccountDeterminationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        await this.rules.assertCompanyAccess(dto.companyId, user)
        return this.resolution.resolveDetermination({
            ...dto,
            dimensions: dto.dimensions ?? {},
        })
    }

    @Post('mm-migration/dry-run')
    @RequirePermission('fico.account-determination-migration', 'read')
    mmMigrationDryRun(
        @Query('companyId') companyId: string,
        @Query('postingDate') postingDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.mmMigration.dryRunReport(companyId, user, { postingDate })
    }

    @Post('mm-migration/apply-drafts')
    @RequirePermission('fico.account-determination-migration', 'update')
    mmMigrationApplyDrafts(
        @Query('companyId') companyId: string,
        @Query('postingDate') postingDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.mmMigration.applyProposedDraftRules(companyId, user, { postingDate })
    }

    @Post('simulate')
    @RequirePermission('fico.account-determination', 'read')
    simulate(
        @Body() dto: FicoDeterminationSimulationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.simulation.simulate(dto as never, user)
    }

    @Post('simulate-batch')
    @RequirePermission('fico.account-determination', 'read')
    simulateBatch(
        @Body() dto: FicoDeterminationSimulationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.simulation.simulate(
            { ...dto, mode: 'MULTI_KEY' } as never,
            user,
        )
    }

    @Post('validate-conflicts')
    @RequirePermission('fico.account-determination', 'read')
    validateConflicts(
        @Body() dto: FicoDeterminationConflictCheckDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.simulation.analyseConflicts(dto, user)
    }

    @Post('migration/dry-run')
    @RequirePermission('fico.account-determination-migration', 'read')
    migrationDryRun(
        @Query('companyId') companyId: string,
        @Query('postingDate') postingDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.mmMigration.dryRunReport(companyId, user, { postingDate })
    }

    /** Legacy vs centralized resolution comparison (read-only). */
    @Post('migration/compare')
    @RequirePermission('fico.account-determination-migration', 'read')
    migrationCompare(
        @Query('companyId') companyId: string,
        @Query('postingDate') postingDate: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.mmMigration.dryRunReport(companyId, user, {
            postingDate,
            compareCentral: true,
        })
    }

    @Get('gl-accounts')
    @RequirePermission('fico.account-determination', 'read')
    eligibleGlAccounts(
        @Query('companyId') companyId: string,
        @Query('search') search: string | undefined,
        @Query('transactionKeyCode') transactionKeyCode: string | undefined,
        @CurrentUser() user: AuthRequestUser,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required.')
        }
        return this.rules.listEligibleGlAccounts(companyId, user, {
            search,
            transactionKeyCode,
        })
    }

    @Post('rules/validate-draft')
    @RequirePermission('fico.account-determination', 'read')
    validateDraft(
        @Body() dto: FicoDeterminationRuleCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.validateDraft(dto, user)
    }

    @Post('resolve-batch')
    @RequirePermission('fico.account-determination', 'read')
    async resolveBatch(
        @Body() dto: FicoAccountDeterminationBatchDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        await this.rules.assertCompanyAccess(dto.companyId, user)
        const result = await this.resolution.resolveDeterminationBatch({
            ...dto,
            dimensions: dto.dimensions ?? {},
        })
        if ('ok' in result && result.ok === false) {
            return result
        }
        return result
    }

    @Get('rules')
    @RequirePermission('fico.account-determination', 'read')
    list(
        @Query() query: FicoDeterminationRuleQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.list(query, user)
    }

    @Post('rules')
    @RequirePermission('fico.account-determination', 'create')
    create(
        @Body() dto: FicoDeterminationRuleCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.create(dto, user)
    }

    @Post('rules/:id/duplicate')
    @RequirePermission('fico.account-determination', 'create')
    duplicateRule(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.duplicateAsDraft(id, user)
    }

    @Get('rules/:id')
    @RequirePermission('fico.account-determination', 'read')
    get(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.get(id, user)
    }

    @Get('rules/:id/history')
    @RequirePermission('fico.account-determination', 'read')
    history(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.history(id, user)
    }

    @Patch('rules/:id')
    @RequirePermission('fico.account-determination', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationRuleUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.update(id, dto, user)
    }

    @Delete('rules/:id')
    @RequirePermission('fico.account-determination', 'delete')
    remove(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.remove(id, user)
    }

    // ------------------------------------------------------------------
    // Approval lifecycle
    // ------------------------------------------------------------------

    @Post('rules/:id/submit')
    @RequirePermission('fico.account-determination', 'update')
    submit(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.submit(id, user)
    }

    @Post('rules/:id/resubmit')
    @RequirePermission('fico.account-determination', 'update')
    resubmit(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.resubmit(id, user)
    }

    @Post('rules/:id/validate')
    @RequirePermission('fico.account-determination', 'read')
    validateRule(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.validateExisting(id, user)
    }

    @Post('rules/:id/new-version')
    @RequirePermission('fico.account-determination', 'create')
    newVersion(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationNewVersionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.newVersion(id, dto, user)
    }

    @Post('rules/:id/approve')
    @RequirePermission('fico.account-determination-approval', 'update')
    approve(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.approve(id, dto, user)
    }

    @Post('rules/:id/reject')
    @RequirePermission('fico.account-determination-approval', 'update')
    reject(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.reject(id, dto, user)
    }

    @Post('rules/:id/activate')
    @RequirePermission('fico.account-determination-activation', 'update')
    activate(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.activate(id, user)
    }

    @Post('rules/:id/deactivate')
    @RequirePermission('fico.account-determination-activation', 'update')
    deactivate(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.deactivate(id, dto, user)
    }

    /** Resolution enforces company access before evaluating any rule. */
    private async resolveForUser(
        dto: FicoAccountResolutionDto,
        user: AuthRequestUser,
    ) {
        await this.rules.assertCompanyAccess(dto.companyId, user)
        return this.resolution.resolve(dto)
    }
}
