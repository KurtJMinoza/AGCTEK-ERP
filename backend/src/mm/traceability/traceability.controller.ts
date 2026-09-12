import { Controller, Get, Param, UsePipes, ValidationPipe } from '@nestjs/common'
import { TraceabilityService } from './traceability.service'

@Controller('mm/traceability')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TraceabilityController {
    constructor(private service: TraceabilityService) {}

    @Get('batches/:id')
    getBatch(@Param('id') id: string) {
        return this.service.getBatch(id)
    }

    @Get('batches/:id/forward')
    batchForward(@Param('id') id: string) {
        return this.service.batchForward(id)
    }

    @Get('batches/:id/backward')
    batchBackward(@Param('id') id: string) {
        return this.service.batchBackward(id)
    }

    @Get('batches/:id/where-used')
    batchWhereUsed(@Param('id') id: string) {
        return this.service.batchWhereUsed(id)
    }

    @Get('serials/:id')
    getSerial(@Param('id') id: string) {
        return this.service.getSerial(id)
    }
}
