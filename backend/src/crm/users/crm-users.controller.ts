import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../permissions/permission.guard'
import { CrmUsersService } from './crm-users.service'

@Controller('crm/users')
export class CrmUsersController {
    constructor(private readonly users: CrmUsersService) {}

    /** Active users for owner / assignee pickers (any CRM read access). */
    @Get()
    @RequirePermission('crm', 'read')
    list(@Query('search') search?: string) {
        return this.users.list(search)
    }
}
