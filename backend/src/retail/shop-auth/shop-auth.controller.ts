import {
    Body,
    Controller,
    Get,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { ShopAuthService } from './shop-auth.service'
import {
    ShopEmailRequestDto,
    ShopEmailVerifyDto,
    ShopGoogleSignInDto,
} from './dto/shop-auth.dto'
import {
    CurrentRetailClientId,
    RetailClientAuthGuard,
} from '../retail-client.guard'
import { RetailClientService } from '../retail-client.service'

@Controller('shop/auth')
export class ShopAuthController {
    constructor(
        private readonly shopAuth: ShopAuthService,
        private readonly retailClients: RetailClientService,
    ) {}

    /** Public shop auth UI config (Google client id is not secret). */
    @Get('public-config')
    publicConfig() {
        const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null
        return {
            googleClientId,
            googleSignInEnabled: Boolean(googleClientId),
        }
    }

    @Post('email/request-code')
    requestCode(@Body() body: ShopEmailRequestDto, @Req() req: FastifyRequest) {
        body.validateGmail()
        return this.shopAuth.requestEmailCode(
            body.email,
            req.ip,
            req.headers['user-agent'],
        )
    }

    @Post('email/verify-code')
    verifyCode(@Body() body: ShopEmailVerifyDto) {
        body.validateGmail()
        return this.shopAuth.verifyEmailCode(
            body.email,
            body.code,
            body.firstName,
        )
    }

    @Post('google')
    google(@Body() body: ShopGoogleSignInDto) {
        return this.shopAuth.signInWithGoogle(body.credential)
    }

    @Get('me')
    @UseGuards(RetailClientAuthGuard)
    me(@CurrentRetailClientId() clientId: string) {
        return this.retailClients.getProfile(clientId)
    }

    @Post('logout')
    @UseGuards(RetailClientAuthGuard)
    logout() {
        return { status: 'success', message: 'Signed out.' }
    }
}
