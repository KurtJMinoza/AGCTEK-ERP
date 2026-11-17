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
    FicoTaxCodeActivateDto,
    FicoTaxCodeCreateDto,
    FicoTaxCodeDeactivateDto,
    FicoTaxCodeDuplicateDto,
    FicoTaxCodeHistoryQueryDto,
    FicoTaxCodeListQueryDto,
    FicoTaxCodeUpdateDto,
    FicoTaxCalculationDto,
    FicoTaxRateCreateDto,
    FicoTaxRateQueryDto,
    FicoTaxRateUpdateDto,
} from './dto/fico-phase1.dto'
import { FicoTaxCodeService } from './fico-tax-code.service'

@Controller('fico')
export class FicoTaxCodeController {
    constructor(private readonly taxCodes: FicoTaxCodeService) {}

    // ---------------------------------------------------------------------
    // Tax Code CRUD
    // ---------------------------------------------------------------------

    @Get('tax-codes')
    @RequirePermission('fico.tax-codes', 'read')
    list(
        @Query() query: FicoTaxCodeListQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.list(query, user)
    }

    @Get('tax-codes/summary')
    @RequirePermission('fico.tax-codes', 'read')
    summary(
        @Query('companyId') companyId: string,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.summary(companyId, user)
    }

    @Post('tax-codes')
    @RequirePermission('fico.tax-codes', 'create')
    create(
        @Body() dto: FicoTaxCodeCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.create(dto, user)
    }

    @Get('tax-codes/:id')
    @RequirePermission('fico.tax-codes', 'read')
    get(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.taxCodes.get(id, user)
    }

    @Patch('tax-codes/:id')
    @RequirePermission('fico.tax-codes', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: FicoTaxCodeUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.update(id, dto, user)
    }

    @Delete('tax-codes/:id')
    @RequirePermission('fico.tax-codes', 'delete')
    remove(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.taxCodes.remove(id, user)
    }

    @Post('tax-codes/:id/activate')
    @RequirePermission('fico.tax-codes', 'update')
    activate(
        @Param('id') id: string,
        @Body() dto: FicoTaxCodeActivateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.activate({ ...dto, taxCodeId: id }, user)
    }

    @Post('tax-codes/:id/deactivate')
    @RequirePermission('fico.tax-codes', 'update')
    deactivate(
        @Param('id') id: string,
        @Body() dto: FicoTaxCodeDeactivateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.deactivate({ ...dto, taxCodeId: id }, user)
    }

    @Post('tax-codes/:id/duplicate')
    @RequirePermission('fico.tax-codes', 'create')
    duplicate(
        @Param('id') id: string,
        @Body() dto: FicoTaxCodeDuplicateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.duplicate(id, dto, user)
    }

    @Get('tax-codes/:id/history')
    @RequirePermission('fico.tax-codes', 'read')
    history(
        @Param('id') id: string,
        @Query() query: FicoTaxCodeHistoryQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.history(id, query, user)
    }

    // ---------------------------------------------------------------------
    // Tax Rate Management
    // ---------------------------------------------------------------------

    @Get('tax-codes/:taxCodeId/rates')
    @RequirePermission('fico.tax-codes', 'read')
    listRates(
        @Param('taxCodeId') taxCodeId: string,
        @Query() query: FicoTaxRateQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.getRates({ ...query, taxCodeId }, user)
    }

    @Post('tax-codes/:taxCodeId/rates')
    @RequirePermission('fico.tax-codes', 'create')
    createRate(
        @Param('taxCodeId') taxCodeId: string,
        @Body() dto: FicoTaxRateCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.createRate(taxCodeId, dto, user)
    }

    @Patch('tax-codes/:taxCodeId/rates/:rateId')
    @RequirePermission('fico.tax-codes', 'update')
    updateRate(
        @Param('taxCodeId') taxCodeId: string,
        @Param('rateId') rateId: string,
        @Body() dto: FicoTaxRateUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.updateRate(taxCodeId, rateId, dto, user)
    }

    // ---------------------------------------------------------------------
    // Tax Calculation Preview
    // ---------------------------------------------------------------------

    @Post('tax-codes/calculate')
    @RequirePermission('fico.tax-codes', 'read')
    calculate(
        @Body() dto: FicoTaxCalculationDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.taxCodes.calculate(dto, user)
    }

    // ---------------------------------------------------------------------
    // Tax Code Utilization
    // ---------------------------------------------------------------------

    @Get('tax-codes/:id/utilization')
    @RequirePermission('fico.tax-codes', 'read')
    utilization(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.taxCodes.utilization(id, user)
    }
}
