import { Injectable, BadRequestException } from '@nestjs/common'
import { PutawayCompletionHandler } from './putaway-completion.handler'
import { CompleteTaskDto } from '../dto/warehouse-task.dto'
import { WmWarehouseTask } from '@prisma/client'

/** Relocation is a bin-to-bin transfer — same IPS path as putaway. */
@Injectable()
export class RelocationCompletionHandler {
    constructor(private putawayHandler: PutawayCompletionHandler) {}

    complete(task: WmWarehouseTask, dto: CompleteTaskDto) {
        if (!task.sourceBinId) {
            throw new BadRequestException('sourceBinId is required for relocation')
        }
        return this.putawayHandler.complete(task, dto)
    }
}
