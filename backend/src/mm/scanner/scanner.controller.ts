import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateOrReject } from 'class-validator'
import { ScannerEventService } from './scanner-event.service'
import { BarcodeResolveService } from './barcode-resolve.service'
import {
    ScannerEventDto,
    ResolveQueryDto,
    ScannerEventsQueryDto,
    ScannerEventBatchDto,
} from './dto/scanner.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

function normalizeScannerBody(raw: Record<string, any>): Record<string, any> {
    const alias = (camel: string, snake: string) =>
        raw[camel] !== undefined && raw[camel] !== null ? raw[camel] : raw[snake]
    return {
        ...raw,
        deviceId: alias('deviceId', 'device_id'),
        userId: alias('userId', 'user_id'),
        idempotencyKey: alias('idempotencyKey', 'idempotency_key'),
        warehouseId: alias('warehouseId', 'warehouse'),
        timestamp: alias('timestamp', 'timestamp'),
        bin: alias('bin', 'bin'),
        batch: alias('batch', 'batch'),
        serial: alias('serial', 'serial'),
    }
}

@Controller('mm/scanner')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ScannerController {
    constructor(
        private eventService: ScannerEventService,
        private resolveService: BarcodeResolveService,
    ) {}

    @MmMutation()
    @Post('events')
    async processEvent(@Body() body: Record<string, any>) {
        const dto = plainToInstance(ScannerEventDto, normalizeScannerBody(body), {
            enableImplicitConversion: true,
        })
        await validateOrReject(dto)
        return this.eventService.processEvent(dto)
    }

    @MmMutation()
    @Post('events/batch')
    async processBatch(@Body() body: Record<string, any>) {
        const rawEvents = Array.isArray(body?.events) ? body.events : []
        const events = await Promise.all(
            rawEvents.map(async (e: Record<string, any>) => {
                const dto = plainToInstance(
                    ScannerEventDto,
                    normalizeScannerBody(e),
                    { enableImplicitConversion: true },
                )
                await validateOrReject(dto)
                return dto
            }),
        )
        if (events.length === 0) {
            return { results: [], processed: 0 }
        }
        if (events.length > 50) {
            return this.eventService.processBatch(events.slice(0, 50))
        }
        // Keep DTO for documentation; validation already done per item
        void (plainToInstance(ScannerEventBatchDto, { events }) as ScannerEventBatchDto)
        return this.eventService.processBatch(events)
    }

    @Get('events')
    listEvents(@Query() query: ScannerEventsQueryDto) {
        return this.eventService.listEvents(query)
    }

    @Get('resolve')
    resolve(@Query() query: ResolveQueryDto) {
        return this.resolveService.resolve(query.barcode, query.companyId)
    }
}
