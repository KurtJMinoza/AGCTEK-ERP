import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { MODULE_CODES } from '../../permissions/permissions.constants'
import { ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto'
import { CrmLeadsService } from './leads.service'

@Controller('crm/leads')
export class CrmLeadsController {
    constructor(private readonly leads: CrmLeadsService) {}

    @Get()
    @RequirePermission(MODULE_CODES.CRM, 'read')
    list(@Query() query: ListLeadsQueryDto) {
        return this.leads.list(query)
    }

    @Get(':id')
    @RequirePermission(MODULE_CODES.CRM, 'read')
    findOne(@Param('id') id: string) {
        return this.leads.findOne(id)
    }

    @Post()
    @RequirePermission(MODULE_CODES.CRM, 'create')
    create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthRequestUser) {
        return this.leads.create(dto, user.id)
    }

    @Patch(':id')
    @RequirePermission(MODULE_CODES.CRM, 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateLeadDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.leads.update(id, dto, user.id)
    }

    /** Creates an opportunity (and optionally an SD customer, which also needs sd:create). */
    @Post(':id/convert')
    @RequirePermission(MODULE_CODES.CRM, 'create')
    convert(
        @Param('id') id: string,
        @Body() dto: ConvertLeadDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.leads.convert(id, dto, user)
    }
}
