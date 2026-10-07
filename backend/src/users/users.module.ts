import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { UserCompaniesService } from './user-companies.service'
import { UserAuthGuard } from '../auth/user-auth.guard'

@Module({
    controllers: [UsersController],
    providers: [UsersService, UserCompaniesService, UserAuthGuard],
})
export class UsersModule {}
