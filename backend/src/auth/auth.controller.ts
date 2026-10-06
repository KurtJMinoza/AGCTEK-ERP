import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AllowDuringMaintenance } from '../system-settings/maintenance-mode.guard'

type SignUpBody = {
    email: string
    userName: string
    firstName?: string
    lastName?: string
    jobPosition?: string
    password: string
    /** Ignored: public sign-up always uses the `default_user_role` system setting. */
    role?: string
}

type SignInBody = {
    userName: string
    password: string
}

type UpdateProfileBody = {
    userName: string
    email?: string
    newUserName?: string
    firstName?: string
    lastName?: string
    jobPosition?: string
    bio?: string
    avatar?: string
}

type ChangePasswordBody = {
    userName: string
    currentPassword: string
    newPassword: string
}

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('sign-up')
    @AllowDuringMaintenance()
    signUp(@Body() body: SignUpBody) {
        return this.authService.signUp(body)
    }

    /** Valid credentials always authenticate; the frontend routes non-super-admins to /maintenance. */
    @Post('sign-in')
    @AllowDuringMaintenance()
    signIn(@Body() body: SignInBody) {
        return this.authService.signIn(body)
    }

    @Get('profile')
    getProfile(@Query('userName') userName: string) {
        return this.authService.getProfile(userName)
    }

    @Patch('profile')
    updateProfile(@Body() body: UpdateProfileBody) {
        return this.authService.updateProfile(body)
    }

    @Patch('password')
    changePassword(@Body() body: ChangePasswordBody) {
        return this.authService.changePassword(body)
    }
}
