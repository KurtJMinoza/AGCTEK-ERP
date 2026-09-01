import { Body, Controller, Post } from '@nestjs/common'
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
}
