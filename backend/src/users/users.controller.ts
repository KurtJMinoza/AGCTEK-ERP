import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common'
import { USER_ROLES } from '../auth/auth.constants'
import {
    CurrentUser,
    RequireRoles,
    type AuthRequestUser,
} from '../auth/auth.decorator'
import { UserAuthGuard } from '../auth/user-auth.guard'
import { UsersService } from './users.service'
import { UserCompaniesService } from './user-companies.service'
import {
    AssignCompanyDto,
    CreateUserDto,
    UpdateUserDto,
    UpdateUserStatusDto,
    UserQueryDto,
} from './dto/users.dto'

@Controller('users')
@UseGuards(UserAuthGuard)
@RequireRoles(USER_ROLES.SUPER_ADMIN)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly userCompanies: UserCompaniesService,
    ) {}

    @Get()
    list(@Query() query: UserQueryDto) {
        return this.usersService.list(query)
    }

    @Get('company-options')
    listCompanyOptions() {
        return this.userCompanies.listCompanyOptions()
    }

    @Post()
    create(@Body() body: CreateUserDto) {
        return this.usersService.create(body)
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() body: UpdateUserDto,
        @CurrentUser() actor: AuthRequestUser,
    ) {
        return this.usersService.update(id, body, actor.id)
    }

    @Patch(':id/status')
    setStatus(
        @Param('id') id: string,
        @Body() body: UpdateUserStatusDto,
        @CurrentUser() actor: AuthRequestUser,
    ) {
        return this.usersService.setStatus(id, body.isActive, actor.id)
    }

    @Get(':id/companies')
    listCompanies(@Param('id') id: string) {
        return this.userCompanies.listForUser(id)
    }

    @Post(':id/companies')
    assignCompany(@Param('id') id: string, @Body() body: AssignCompanyDto) {
        return this.userCompanies.assign(id, body.companyId)
    }

    @Delete(':id/companies/:companyId')
    removeCompany(
        @Param('id') id: string,
        @Param('companyId') companyId: string,
    ) {
        return this.userCompanies.remove(id, companyId)
    }

    @Patch(':id/companies/:companyId/default')
    setDefaultCompany(
        @Param('id') id: string,
        @Param('companyId') companyId: string,
    ) {
        return this.userCompanies.setDefault(id, companyId)
    }
}
