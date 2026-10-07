import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../../auth/auth.decorator'
import { RequirePermission } from '../../permissions/permission.guard'
import { ConvertLeadDto, CreateLeadDto, ListLeadsQueryDto, UpdateLeadDto } from './dto/lead.dto'
import { CrmLeadsService } from './leads.service'

@Controller('crm/leads')
export class CrmLeadsController {
    constructor(private readonly leads: CrmLeadsService) {}

    @Get()
    @RequirePermission('crm.leads', 'read')
    list(@Query() query: ListLeadsQueryDto) {
        return this.leads.list(query)
    }

    @Get(':id')
    @RequirePermission('crm.leads', 'read')
    findOne(@Param('id') id: string) {
        return this.leads.findOne(id)
    }

    @Post()
    @RequirePermission('crm.leads', 'create')
    create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthRequestUser) {
        return this.leads.create(dto, user.id)
    }

    @Patch(':id')
    @RequirePermission('crm.leads', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateLeadDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.leads.update(id, dto, user.id)
    }

    /** Creates an opportunity (and optionally an SD customer, which also needs sd:create). */
    @Post(':id/convert')
    @RequirePermission('crm.leads', 'create')
    convert(
        @Param('id') id: string,
        @Body() dto: ConvertLeadDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.leads.convert(id, dto, user)
    }
}
