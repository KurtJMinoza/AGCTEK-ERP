import { Controller, Get, Post, Param, Query, Body, BadRequestException } from '@nestjs/common'
import { PutawayService } from './putaway.service'
import { CreatePutawayDto } from './dto/create-putaway.dto'
import { PutawayQueryDto } from './dto/putaway-query.dto'
import { ConfirmPutawayDto } from './dto/confirm-putaway.dto'
import { AssignPutawayDto } from './dto/assign-putaway.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('warehouse-management', 'my-tasks', 'overview', 'task-queue')

@Controller('mm/putaway')
export class PutawayController {
    constructor(private readonly service: PutawayService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: PutawayQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks'), 'create')
    create(@Body() dto: CreatePutawayDto) {
        return this.service.create(dto)
    }

    @Post(':id/assign')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks'), 'update')
    assign(@Param('id') id: string, @Body() dto: AssignPutawayDto) {
        const worker = dto.workerId || dto.assignedWorker
        if (!worker) throw new BadRequestException('workerId is required')
        return this.service.assign(id, worker)
    }

    @Post(':id/confirm')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks'), 'update')
    confirm(@Param('id') id: string, @Body() dto: ConfirmPutawayDto) {
        return this.service.confirm(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks'), 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
