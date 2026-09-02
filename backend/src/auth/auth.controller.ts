import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common'
import { AuthService } from './auth.service'

type SignUpBody = {
    email: string
    userName: string
    password: string
    role: string
}

type SignInBody = {
    userName: string
    password: string
}

type UpdateProfileBody = {
    userName: string
    email?: string
    newUserName?: string
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
    signUp(@Body() body: SignUpBody) {
        return this.authService.signUp(body)
    }

    @Post('sign-in')
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
