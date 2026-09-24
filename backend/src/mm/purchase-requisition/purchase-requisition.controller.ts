import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { PurchaseRequisitionService } from './purchase-requisition.service'
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto'
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto'
import { PurchaseRequisitionQueryDto } from './dto/purchase-requisition-query.dto'
import { ConvertPurchaseRequisitionDto } from './dto/convert-pr-line.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

class ActionResult {
    reason?: string
    comment?: string
    performedBy?: string
}

@Controller('mm/purchase-requisitions')
export class PurchaseRequisitionController {
    constructor(private service: PurchaseRequisitionService) {}

    @Post()
    @MmMutation()
    create(@Body() dto: CreatePurchaseRequisitionDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll(@Query() query: PurchaseRequisitionQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    @MmMutation()
    update(@Param('id') id: string, @Body() dto: UpdatePurchaseRequisitionDto) {
        return this.service.update(id, dto, dto.requesterId ?? undefined)
    }

    @Post(':id/submit')
    @MmMutation()
    submit(@Param('id') id: string, @Body() body: ActionResult) {
        return this.service.submit(id, body?.performedBy)
    }

    @Post(':id/approve')
    @MmMutation()
    approve(@Param('id') id: string, @Body() body: ActionResult) {
        // Approval happens via the workflow engine; this endpoint delegates
        // to the first pending task on the PR's workflow instance.
        return this.service.approveViaWorkflow(id, body?.performedBy, body?.comment)
    }

    @Post(':id/reject')
    @MmMutation()
    reject(@Param('id') id: string, @Body() body: ActionResult) {
        return this.service.rejectViaWorkflow(id, body?.reason ?? body?.comment, body?.performedBy)
    }

    @Post(':id/return')
    @MmMutation()
    returnPr(@Param('id') id: string, @Body() body: ActionResult) {
        return this.service.returnViaWorkflow(id, body?.comment, body?.performedBy)
    }

    @Post(':id/cancel')
    @MmMutation()
    cancel(@Param('id') id: string, @Body() body: ActionResult) {
        return this.service.cancel(id, body?.performedBy)
    }

    @Post(':id/close')
    @MmMutation()
    close(@Param('id') id: string, @Body() body: ActionResult) {
        return this.service.close(id, body?.performedBy)
    }

    @Post(':id/convert')
    @MmMutation()
    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    convert(@Param('id') id: string, @Body() dto: ConvertPurchaseRequisitionDto) {
        return this.service.convert(id, dto)
    }

    @Get(':id/audit')
    getAudit(@Param('id') id: string) {
        return this.service.getAudit(id)
    }
}