import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common'
import { RetailClientService } from './retail-client.service'
import {
    RetailAddressDto,
    RetailLoginDto,
    RetailRegisterDto,
    RetailReplaceCartDto,
    RetailUpdateAddressDto,
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

    // ── Multi-address book ─────────────────────────────────────────────────

    @Get(':clientId/addresses')
    listAddresses(@Param('clientId') clientId: string) {
        return this.retailClientService.listAddresses(clientId)
    }

    @Post(':clientId/addresses')
    createAddress(
        @Param('clientId') clientId: string,
        @Body() body: RetailAddressDto,
    ) {
        return this.retailClientService.createAddress(clientId, body)
    }

    @Patch('addresses/:addressId')
    updateAddress(
        @Param('addressId') addressId: string,
        @Body() body: RetailUpdateAddressDto,
    ) {
        return this.retailClientService.updateAddress(addressId, body)
    }

    @Post('addresses/:addressId/default')
    setDefaultAddress(@Param('addressId') addressId: string) {
        return this.retailClientService.setDefaultAddress(addressId)
    }

    @Delete('addresses/:addressId')
    deleteAddress(@Param('addressId') addressId: string) {
        return this.retailClientService.deleteAddress(addressId)
    }
}
