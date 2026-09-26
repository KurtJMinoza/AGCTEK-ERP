import { Body, Controller, Get, Patch, Post, Put, Query } from '@nestjs/common'
import { RetailClientService } from './retail-client.service'
import {
    RetailLoginDto,
    RetailRegisterDto,
    RetailReplaceCartDto,
    RetailUpdateProfileDto,
} from './dto/retail-client.dto'

@Controller('retail/clients')
export class RetailClientController {
    constructor(private readonly retailClientService: RetailClientService) {}

    @Post('register')
    register(@Body() body: RetailRegisterDto) {
        return this.retailClientService.register(body)
    }

    @Post('login')
    login(@Body() body: RetailLoginDto) {
        return this.retailClientService.login(body)
    }

    @Get('me')
    getProfile(@Query('clientId') clientId: string) {
        return this.retailClientService.getProfile(clientId)
    }

    @Patch('me')
    updateProfile(@Body() body: RetailUpdateProfileDto) {
        return this.retailClientService.updateProfile(body)
    }

    @Get('cart')
    getCart(@Query('clientId') clientId: string) {
        return this.retailClientService.getCart(clientId)
    }

    @Put('cart')
    replaceCart(@Body() body: RetailReplaceCartDto) {
        return this.retailClientService.replaceCart(body.clientId, body.items)
    }
}
