import {
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
    FicoAccountResolutionDto,
    FicoDeterminationReasonDto,
    FicoDeterminationRuleCreateDto,
    FicoDeterminationRuleQueryDto,
    FicoDeterminationRuleUpdateDto,
} from './dto/account-determination.dto'
import { FicoAccountDeterminationRulesService } from './fico-account-determination-rules.service'
import { FicoAccountResolutionService } from './fico-account-resolution.service'

@Controller('fico/account-determination')
export class FicoAccountDeterminationController {
    constructor(
        private readonly rules: FicoAccountDeterminationRulesService,
        private readonly resolution: FicoAccountResolutionService,
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

    @Get('summary')
    @RequirePermission('fico.account-determination', 'read')
    overview(
        @Query() query: FicoDeterminationRuleQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.overview(query, user)
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

    @Post('rules/:id/approve')
    @RequirePermission('fico.account-determination', 'update')
    approve(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.approve(id, dto, user)
    }

    @Post('rules/:id/reject')
    @RequirePermission('fico.account-determination', 'update')
    reject(
        @Param('id') id: string,
        @Body() dto: FicoDeterminationReasonDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.rules.reject(id, dto, user)
    }

    @Post('rules/:id/activate')
    @RequirePermission('fico.account-determination', 'update')
    activate(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.rules.activate(id, user)
    }

    @Post('rules/:id/deactivate')
    @RequirePermission('fico.account-determination', 'update')
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
