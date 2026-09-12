import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common'
import { PurchaseOrderService } from './purchase-order.service'
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto'
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto'
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto'
import {
    CreatePoFromAwardDto,
    CreatePoFromPrDto,
    CreatePoAttachmentDto,
    UpsertPoToleranceDto,
    RevisePurchaseOrderDto,
} from './dto/po-actions.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

class ActionBody {
    reason?: string
    comment?: string
    performedBy?: string
}

@Controller('mm/purchase-orders')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PurchaseOrderController {
    constructor(private service: PurchaseOrderService) {}

    @Post()
    @MmMutation()
    create(@Body() dto: CreatePurchaseOrderDto) {
        return this.service.create(dto)
    }

    @Post('from-award')
    @MmMutation()
    fromAward(@Body() dto: CreatePoFromAwardDto) {
        return this.service.createFromAward(dto)
    }

    @Post('from-pr')
    @MmMutation()
    fromPr(@Body() dto: CreatePoFromPrDto) {
        return this.service.createFromPr(dto)
    }

    @Get()
    findAll(@Query() query: PurchaseOrderQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    @MmMutation()
    update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
        return this.service.update(id, dto, dto.buyerId ?? undefined)
    }

    @Post(':id/submit')
    @MmMutation()
    submit(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.submit(id, body?.performedBy)
    }

    @Post(':id/approve')
    @MmMutation()
    approve(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.approveViaWorkflow(id, body?.performedBy, body?.comment)
    }

    @Post(':id/reject')
    @MmMutation()
    reject(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.rejectViaWorkflow(id, body?.reason ?? body?.comment, body?.performedBy)
    }

    @Post(':id/return')
    @MmMutation()
    returnPo(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.returnViaWorkflow(id, body?.comment, body?.performedBy)
    }

    @Post(':id/revise')
    @MmMutation()
    revise(@Param('id') id: string, @Body() dto: RevisePurchaseOrderDto) {
        return this.service.revise(id, dto)
    }

    @Post(':id/send')
    @MmMutation()
    send(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.send(id, body?.performedBy)
    }

    @Post(':id/cancel')
    @MmMutation()
    cancel(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.cancel(id, body?.reason, body?.performedBy)
    }

    @Post(':id/close')
    @MmMutation()
    close(@Param('id') id: string, @Body() body: ActionBody) {
        return this.service.close(id, body?.performedBy)
    }

    @Get(':id/audit')
    getAudit(@Param('id') id: string) {
        return this.service.getAudit(id)
    }

    @Get(':id/document-flow')
    getDocumentFlow(@Param('id') id: string) {
        return this.service.getDocumentFlow(id)
    }

    @Get(':id/attachments')
    listAttachments(@Param('id') id: string) {
        return this.service.listAttachments(id)
    }

    @Post(':id/attachments')
    @MmMutation()
    addAttachment(@Param('id') id: string, @Body() dto: CreatePoAttachmentDto) {
        return this.service.addAttachment(id, dto)
    }

    @Delete(':id/attachments/:attachmentId')
    @MmMutation()
    deleteAttachment(
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
        @Body() body: ActionBody,
    ) {
        return this.service.deleteAttachment(id, attachmentId, body?.performedBy)
    }
}

@Controller('mm/po-tolerances')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PoToleranceController {
    constructor(private service: PurchaseOrderService) {}

    @Get()
    get(@Query('companyId') companyId: string) {
        return this.service.getTolerances(companyId)
    }

    @Put()
    upsert(@Body() dto: UpsertPoToleranceDto) {
        return this.service.upsertTolerances(dto)
    }
}
