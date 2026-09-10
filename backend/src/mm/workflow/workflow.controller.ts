import {
    Controller,
    Get,
    Post,
    Param,
    Body,
} from '@nestjs/common'
import { WorkflowService } from './workflow.service'
import { DecideTaskDto } from './dto/decide-task.dto'

@Controller('mm/workflows')
export class WorkflowController {
    constructor(private service: WorkflowService) {}

    @Get()
    findDefinitions() {
        return this.service.findDefinitions()
    }

    @Get('instances/:entityType/:entityId')
    findByEntity(
        @Param('entityType') entityType: string,
        @Param('entityId') entityId: string,
    ) {
        return this.service.findByEntity(entityType, entityId)
    }

    @Post('tasks/:id/decide')
    decide(@Param('id') id: string, @Body() dto: DecideTaskDto) {
        switch (dto.decision) {
            case 'APPROVE':
                return this.service.approveTask(id, { userId: dto.userId, comment: dto.comment })
            case 'REJECT':
                return this.service.rejectTask(id, { userId: dto.userId, comment: dto.comment })
            case 'RETURN':
                return this.service.returnTask(id, { userId: dto.userId, comment: dto.comment })
        }
    }
}