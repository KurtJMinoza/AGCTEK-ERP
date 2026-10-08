import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { WarehouseTaskService } from './warehouse-task.service'
import { WarehouseExceptionService } from './warehouse-exception.service'
import {
    AssignTaskDto,
    CancelTaskDto,
    CompleteTaskDto,
    CreateWarehouseTaskDto,
    ReleaseExceptionDto,
    ReportExceptionDto,
    StartTaskDto,
    WarehouseTaskQueryDto,
} from './dto/warehouse-task.dto'
import { MmMutation } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

@Controller('mm/warehouse/tasks')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class WarehouseTaskController {
    constructor(
        private tasks: WarehouseTaskService,
        private exceptions: WarehouseExceptionService,
    ) {}

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'task-queue'))
    create(@Body() dto: CreateWarehouseTaskDto) {
        return this.tasks.create(dto)
    }

    @Get()
    list(@Query() query: WarehouseTaskQueryDto) {
        return this.tasks.findAll(query)
    }

    @Get('my')
    myTasks(@Req() req: any, @Query() query: WarehouseTaskQueryDto) {
        const userId = req.headers['x-user-id'] ?? req.user?.id ?? query.assignedUserId
        if (!userId) return { data: [], total: 0, page: 1, pageSize: 20 }
        return this.tasks.findMyTasks(String(userId), query)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.tasks.findOne(id)
    }

    @Post(':id/assign')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue'))
    assign(@Param('id') id: string, @Body() dto: AssignTaskDto) {
        return this.tasks.assign(id, dto.userId)
    }

    @Post(':id/reassign')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue'))
    reassign(@Param('id') id: string, @Body() dto: AssignTaskDto) {
        return this.tasks.reassign(id, dto.userId)
    }

    @Post(':id/start')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks', 'picking'))
    start(@Param('id') id: string, @Body() dto: StartTaskDto) {
        return this.tasks.start(id, dto)
    }

    @Post(':id/complete')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks', 'picking'))
    complete(@Param('id') id: string, @Body() dto: CompleteTaskDto) {
        return this.tasks.complete(id, dto)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue'))
    cancel(@Param('id') id: string, @Body() dto: CancelTaskDto) {
        return this.tasks.cancel(id, dto)
    }

    @Post(':id/exception')
    @MmMutation(mmFeatures('warehouse-management', 'task-queue', 'my-tasks', 'exceptions'))
    reportException(@Param('id') id: string, @Body() dto: ReportExceptionDto) {
        return this.exceptions.report(id, dto)
    }

    @Post(':id/exception/release')
    @MmMutation(mmFeatures('warehouse-management', 'exceptions', 'task-queue'))
    releaseException(@Param('id') id: string, @Body() dto: ReleaseExceptionDto) {
        return this.exceptions.release(id, dto)
    }
}
