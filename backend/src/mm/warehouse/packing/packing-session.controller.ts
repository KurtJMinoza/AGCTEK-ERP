import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { PackingService } from './packing.service'
import { OpenPackingSessionDto, PackingSessionQueryDto } from './dto/packing-session.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('warehouse-management', 'overview', 'packing')

@Controller('mm/packing-sessions')
export class PackingSessionController {
    constructor(private readonly service: PackingService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: PackingSessionQueryDto) {
        return this.service.findAllSessions(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findSession(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'packing'))
    open(@Body() dto: OpenPackingSessionDto) {
        return this.service.openSession(dto)
    }

    @Post('from-picking/:pickingTaskId')
    @MmMutation(mmFeatures('warehouse-management', 'packing'))
    fromPicking(@Param('pickingTaskId') pickingTaskId: string) {
        return this.service.openSessionFromPicking(pickingTaskId)
    }

    @Post(':id/complete')
    @MmMutation(mmFeatures('warehouse-management', 'packing'))
    complete(@Param('id') id: string) {
        return this.service.completeSession(id)
    }
}
