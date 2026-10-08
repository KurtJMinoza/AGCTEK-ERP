import {
    Body,
    BadRequestException,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common'
import { RetailClientService } from './retail-client.service'
import {
    CurrentRetailClientId,
    RetailClientAuthGuard,
} from './retail-client.guard'
import {
    RetailLoginDto,
    RetailRegisterDto,
    RetailReplaceCartDto,
    RetailUpdateProfileDto,
} from './dto/retail-client.dto'
import {
    RetailAddressUpsertDto,
    RetailUpdateAddressDto,
} from './dto/retail-address.dto'
import { RetailClientAddressService } from './retail-client-address.service'
import { RetailClientAddressGeocodeService } from './retail-client-address-geocode.service'

/** Shopper accounts. `me` / `cart` act on the account in the bearer session token. */
@Controller('retail/clients')
export class RetailClientController {
    constructor(
        private readonly retailClientService: RetailClientService,
        private readonly addressService: RetailClientAddressService,
        private readonly addressGeocode: RetailClientAddressGeocodeService,
    ) {}

    @Post('register')
    register(@Body() body: RetailRegisterDto) {
        return this.retailClientService.register(body)
    }

    @Post('login')
    login(@Body() body: RetailLoginDto) {
        return this.retailClientService.login(body)
    }

    @Get('me')
    @UseGuards(RetailClientAuthGuard)
    getProfile(@CurrentRetailClientId() clientId: string) {
        return this.retailClientService.getProfile(clientId)
    }

    @Patch('me')
    @UseGuards(RetailClientAuthGuard)
    updateProfile(
        @CurrentRetailClientId() clientId: string,
        @Body() body: RetailUpdateProfileDto,
    ) {
        return this.retailClientService.updateProfile(clientId, body)
    }

    @Get('me/addresses')
    @UseGuards(RetailClientAuthGuard)
    listAddresses(@CurrentRetailClientId() clientId: string) {
        return this.addressService.list(clientId)
    }

    @Post('me/addresses')
    @UseGuards(RetailClientAuthGuard)
    createAddress(
        @CurrentRetailClientId() clientId: string,
        @Body() body: RetailAddressUpsertDto,
    ) {
        return this.addressService.create(clientId, body)
    }

    /** Shared OSM-compatible provider is called server-side; the shopper JWT gates access. */
    @Get('me/addresses/geocode/search')
    @UseGuards(RetailClientAuthGuard)
    searchAddress(@Query('q') q?: string, @Query('limit') limit?: string) {
        return this.addressGeocode.search(q?.trim() ?? '', Number(limit) || 5)
    }

    @Get('me/addresses/geocode/reverse')
    @UseGuards(RetailClientAuthGuard)
    reverseAddress(@Query('lat') lat?: string, @Query('lng') lng?: string) {
        const latitude = Number(lat)
        const longitude = Number(lng)
        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            throw new BadRequestException('Invalid coordinates')
        }
        return this.addressGeocode.reverse(latitude, longitude)
    }

    @Get('me/addresses/:addressId')
    @UseGuards(RetailClientAuthGuard)
    getAddress(
        @CurrentRetailClientId() clientId: string,
        @Param('addressId') addressId: string,
    ) {
        return this.addressService.findOne(clientId, addressId)
    }

    @Patch('me/addresses/:addressId')
    @UseGuards(RetailClientAuthGuard)
    updateAddress(
        @CurrentRetailClientId() clientId: string,
        @Param('addressId') addressId: string,
        @Body() body: RetailUpdateAddressDto,
    ) {
        return this.addressService.update(clientId, addressId, body)
    }

    @Patch('me/addresses/:addressId/default')
    @UseGuards(RetailClientAuthGuard)
    setDefaultAddress(
        @CurrentRetailClientId() clientId: string,
        @Param('addressId') addressId: string,
    ) {
        return this.addressService.setDefault(clientId, addressId)
    }

    @Delete('me/addresses/:addressId')
    @UseGuards(RetailClientAuthGuard)
    async removeAddress(
        @CurrentRetailClientId() clientId: string,
        @Param('addressId') addressId: string,
    ) {
        await this.addressService.remove(clientId, addressId)
        return { status: 'success' }
    }

    @Get('cart')
    @UseGuards(RetailClientAuthGuard)
    getCart(@CurrentRetailClientId() clientId: string) {
        return this.retailClientService.getCart(clientId)
    }

    @Put('cart')
    @UseGuards(RetailClientAuthGuard)
    replaceCart(
        @CurrentRetailClientId() clientId: string,
        @Body() body: RetailReplaceCartDto,
    ) {
        return this.retailClientService.replaceCart(clientId, body.items)
    }
}
