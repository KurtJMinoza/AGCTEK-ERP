import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { PackingService } from './packing.service'
import { OpenPackingSessionDto, PackingSessionQueryDto } from './dto/packing-session.dto'
import { MmMutation } from '../../common/mm-mutation.decorator'

@Controller('mm/packing-sessions')
export class PackingSessionController {
    constructor(private readonly service: PackingService) {}

    @Get()
    findAll(@Query() query: PackingSessionQueryDto) {
        return this.service.findAllSessions(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findSession(id)
    }

    @Post()
    @MmMutation()
    open(@Body() dto: OpenPackingSessionDto) {
        return this.service.openSession(dto)
    }

    @Post('from-picking/:pickingTaskId')
    @MmMutation()
    fromPicking(@Param('pickingTaskId') pickingTaskId: string) {
        return this.service.openSessionFromPicking(pickingTaskId)
    }

    @Post(':id/complete')
    @MmMutation()
    complete(@Param('id') id: string) {
        return this.service.completeSession(id)
    }
}
