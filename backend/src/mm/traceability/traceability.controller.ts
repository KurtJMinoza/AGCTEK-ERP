import { Controller, Get, Param, UsePipes, ValidationPipe } from '@nestjs/common'
import { TraceabilityService } from './traceability.service'
import { MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('inventory-management', 'traceability')

@Controller('mm/traceability')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TraceabilityController {
    constructor(private service: TraceabilityService) {}

    @Get('batches/:id')
    @MmRead(READERS)
    getBatch(@Param('id') id: string) {
        return this.service.getBatch(id)
    }

    @Get('batches/:id/forward')
    @MmRead(READERS)
    batchForward(@Param('id') id: string) {
        return this.service.batchForward(id)
    }

    @Get('batches/:id/backward')
    @MmRead(READERS)
    batchBackward(@Param('id') id: string) {
        return this.service.batchBackward(id)
    }

    @Get('batches/:id/where-used')
    @MmRead(READERS)
    batchWhereUsed(@Param('id') id: string) {
        return this.service.batchWhereUsed(id)
    }

    @Get('serials/:id')
    @MmRead(READERS)
    getSerial(@Param('id') id: string) {
        return this.service.getSerial(id)
    }
}
