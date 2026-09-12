import {
    Body,
    Controller,
    Post,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateOrReject } from 'class-validator'
import { MobileExecutionService } from './mobile-execution.service'
import { MobileDeviceService } from './mobile-device.service'
import { ScannerEventDto } from './dto/scanner.dto'
import {
    MobileResolveDto,
    MobileSyncDto,
    RegisterDeviceDto,
} from './dto/mobile.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

function normalize(raw: Record<string, any>): Record<string, any> {
    const alias = (camel: string, snake: string) =>
        raw[camel] !== undefined && raw[camel] !== null ? raw[camel] : raw[snake]
    return {
        ...raw,
        deviceId: alias('deviceId', 'device_id'),
        userId: alias('userId', 'user_id'),
        idempotencyKey: alias('idempotencyKey', 'idempotency_key'),
        warehouseId: alias('warehouseId', 'warehouse'),
        sessionToken: alias('sessionToken', 'session_token'),
        clientTimestamp: alias('clientTimestamp', 'client_timestamp'),
    }
}

async function toEventDto(body: Record<string, any>, operation: string) {
    const dto = plainToInstance(
        ScannerEventDto,
        { ...normalize(body), operation },
        { enableImplicitConversion: true },
    )
    await validateOrReject(dto)
    return {
        ...dto,
        sessionToken: body.sessionToken || body.session_token,
        offlineQueued: !!body.offlineQueued,
        clientTimestamp: body.clientTimestamp || body.client_timestamp,
        expectedSourceBinId: body.expectedSourceBinId,
        expectedTaskUpdatedAt: body.expectedTaskUpdatedAt,
    }
}

@Controller('mm/mobile')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class MobileController {
    constructor(
        private mobile: MobileExecutionService,
        private devices: MobileDeviceService,
    ) {}

    @MmMutation()
    @Post('devices/register')
    registerDevice(@Body() dto: RegisterDeviceDto) {
        return this.devices.register(dto)
    }

    @MmMutation()
    @Post('devices/revoke')
    revokeDevice(@Body() body: { deviceCode: string }) {
        return this.devices.revoke(body.deviceCode)
    }

    @MmMutation()
    @Post('receiving/scan')
    async receivingScan(@Body() body: Record<string, any>) {
        return this.mobile.receivingScan(await toEventDto(body, 'RECEIVING'))
    }

    @MmMutation()
    @Post('putaway/scan')
    async putawayScan(@Body() body: Record<string, any>) {
        return this.mobile.putawayScan(await toEventDto(body, 'PUTAWAY'))
    }

    @MmMutation()
    @Post('picking/scan')
    async pickingScan(@Body() body: Record<string, any>) {
        return this.mobile.pickingScan(await toEventDto(body, 'PICKING'))
    }

    @MmMutation()
    @Post('counting/scan')
    async countingScan(@Body() body: Record<string, any>) {
        return this.mobile.countingScan(await toEventDto(body, 'COUNTING'))
    }

    @MmMutation()
    @Post('sync')
    async sync(@Body() body: Record<string, any>) {
        const dto = plainToInstance(MobileSyncDto, normalize(body), {
            enableImplicitConversion: true,
        })
        await validateOrReject(dto)
        const events = await Promise.all(
            (body.events || []).map(async (e: any) =>
                toEventDto(e, e.operation),
            ),
        )
        return this.mobile.sync({
            deviceId: dto.deviceId,
            companyId: dto.companyId,
            userId: dto.userId,
            sessionToken: dto.sessionToken,
            events: events as any,
        })
    }
}

@Controller('mm/scanner')
export class ScannerResolvePostController {
    constructor(private mobile: MobileExecutionService) {}

    /** Canonical Phase 11: POST /scanner/resolve */
    @Post('resolve')
    async resolvePost(@Body() body: Record<string, any>) {
        const dto = plainToInstance(MobileResolveDto, normalize(body), {
            enableImplicitConversion: true,
        })
        await validateOrReject(dto)
        return this.mobile.resolveBarcode(dto)
    }
}
