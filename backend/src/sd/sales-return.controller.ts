import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreateSalesReturnDto,
    InitiateMmIntakeDto,
    ListSalesReturnsQueryDto,
    SalesReturnActionDto,
} from './dto/sales-return.dto'
import { SalesReturnService } from './sales-return.service'

/**
 * SD Sales Return (customer return integration — Phase 3). Creating a return only records a
 * REQUESTED document; authorize/reject/cancel drive the (legal) lifecycle. The SCM damage-report
 * handoff calls the service directly; this controller serves the SD-side surface.
 */
@Controller('sd/sales-returns')
export class SalesReturnController {
    constructor(private readonly salesReturns: SalesReturnService) {}

    @Get()
    @RequirePermission('sd.sales-returns', 'read')
    list(@Query() query: ListSalesReturnsQueryDto) {
        return this.salesReturns.list(query)
    }

    @Post()
    @RequirePermission('sd.sales-returns', 'create')
    create(
        @Body() dto: CreateSalesReturnDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.salesReturns.create(dto, user)
    }

    @Get(':id')
    @RequirePermission('sd.sales-returns', 'read')
    findOne(@Param('id') id: string) {
        return this.salesReturns.findOne(id)
    }

    @Post(':id/authorize')
    @HttpCode(200)
    @RequirePermission('sd.sales-returns', 'update')
    authorize(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.salesReturns.authorize(id, user)
    }

    @Post(':id/reject')
    @HttpCode(200)
    @RequirePermission('sd.sales-returns', 'update')
    reject(
        @Param('id') id: string,
        @Body() dto: SalesReturnActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.salesReturns.reject(id, dto, user)
    }

    @Post(':id/cancel')
    @HttpCode(200)
    @RequirePermission('sd.sales-returns', 'update')
    cancel(
        @Param('id') id: string,
        @Body() dto: SalesReturnActionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.salesReturns.cancel(id, dto, user)
    }

    /**
     * SD → MM handoff: opens the MM customer return intake for an AUTHORIZED return. Idempotent on
     * the return id; the MM service asserts the intake permission. No inventory is posted here.
     */
    @Post(':id/initiate-intake')
    @HttpCode(200)
    @RequirePermission('sd.sales-returns', 'update')
    initiateIntake(
        @Param('id') id: string,
        @Body() dto: InitiateMmIntakeDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.salesReturns.initiateMmIntake(id, dto, user)
    }
}
