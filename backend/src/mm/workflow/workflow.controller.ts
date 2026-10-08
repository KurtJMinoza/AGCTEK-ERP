import {
    Controller,
    Get,
    Post,
    Param,
    Body,
} from '@nestjs/common'
import { WorkflowService } from './workflow.service'
import { DecideTaskDto } from './dto/decide-task.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('procurement', 'purchase-requisitions', 'purchase-orders', 'po-approvals')

@Controller('mm/workflows')
export class WorkflowController {
    constructor(private service: WorkflowService) {}

    @Get()
    @MmRead(READERS)
    findDefinitions() {
        return this.service.findDefinitions()
    }

    @Get('instances/:entityType/:entityId')
    @MmRead(READERS)
    findByEntity(
        @Param('entityType') entityType: string,
        @Param('entityId') entityId: string,
    ) {
        return this.service.findByEntity(entityType, entityId)
    }

    @Post('tasks/:id/decide')
    @MmMutation(mmFeatures('procurement', 'purchase-requisitions', 'purchase-orders', 'po-approvals'), 'update')
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