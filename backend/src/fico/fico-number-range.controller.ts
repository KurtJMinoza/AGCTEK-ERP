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
    FicoNumberRangeActivateDto,
    FicoNumberRangeCreateDto,
    FicoNumberRangeDeactivateDto,
    FicoNumberRangeHistoryQueryDto,
    FicoNumberRangeListQueryDto,
    FicoNumberRangeNextNumberDto,
    FicoNumberRangeUpdateDto,
} from './dto/fico-phase1.dto'
import { FicoNumberRangeService } from './fico-number-range.service'

@Controller('fico')
export class FicoNumberRangeController {
    constructor(private readonly ranges: FicoNumberRangeService) {}

    // ---------------------------------------------------------------------
    // Number Ranges CRUD
    // ---------------------------------------------------------------------

    @Get('number-ranges')
    @RequirePermission('fico.number-ranges', 'read')
    list(
        @Query() query: FicoNumberRangeListQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.list(query, user)
    }

    @Post('number-ranges')
    @RequirePermission('fico.number-ranges', 'create')
    create(
        @Body() dto: FicoNumberRangeCreateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.create(dto, user)
    }

    @Get('number-ranges/:id')
    @RequirePermission('fico.number-ranges', 'read')
    get(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.ranges.get(id, user)
    }

    @Patch('number-ranges/:id')
    @RequirePermission('fico.number-ranges', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: FicoNumberRangeUpdateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.update(id, dto, user)
    }

    @Delete('number-ranges/:id')
    @RequirePermission('fico.number-ranges', 'delete')
    remove(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.ranges.remove(id, user)
    }

    @Post('number-ranges/:id/activate')
    @RequirePermission('fico.number-ranges', 'update')
    activate(
        @Param('id') id: string,
        @Body() dto: FicoNumberRangeActivateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.activate({ ...dto, rangeCode: id }, user)
    }

    @Post('number-ranges/:id/deactivate')
    @RequirePermission('fico.number-ranges', 'update')
    deactivate(
        @Param('id') id: string,
        @Body() dto: FicoNumberRangeDeactivateDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.deactivate({ ...dto, rangeCode: id }, user)
    }

    // ---------------------------------------------------------------------
    // Number Allocation
    // ---------------------------------------------------------------------

    @Post('number-ranges/:rangeCode/next')
    @RequirePermission('fico.number-ranges', 'create')
    nextNumber(
        @Param('rangeCode') rangeCode: string,
        @Body() dto: FicoNumberRangeNextNumberDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.nextNumber(
            { ...dto, rangeCode },
            user,
        )
    }

    // ---------------------------------------------------------------------
    // Number Range Utilization
    // ---------------------------------------------------------------------

    @Get('number-ranges/:id/utilization')
    @RequirePermission('fico.number-ranges', 'read')
    utilization(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.ranges.utilization(id, user)
    }

    // ---------------------------------------------------------------------
    // Assignment History
    // ---------------------------------------------------------------------

    @Get('number-ranges/:id/history')
    @RequirePermission('fico.number-ranges', 'read')
    history(
        @Param('id') id: string,
        @Query() query: FicoNumberRangeHistoryQueryDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.ranges.history({ ...query, numberRangeId: id }, user)
    }
}
