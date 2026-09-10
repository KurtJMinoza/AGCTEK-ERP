import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { PurchaseContractService } from './purchase-contract.service'
import {
    CreatePurchaseContractDto,
    UpdatePurchaseContractDto,
    PurchaseContractQueryDto,
    LinkContractPoDto,
} from './dto/purchase-contract.dto'

@Controller('mm/purchase-contracts')
export class PurchaseContractController {
    constructor(private service: PurchaseContractService) {}

    @Get()
    list(@Query() query: PurchaseContractQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreatePurchaseContractDto) {
        return this.service.create(dto)
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdatePurchaseContractDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/activate')
    activate(@Param('id') id: string) {
        return this.service.activate(id)
    }

    @Post(':id/expire')
    expire(@Param('id') id: string) {
        return this.service.expire(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
        return this.service.cancel(id, body?.reason)
    }

    @Post(':id/link-po')
    linkPo(@Param('id') id: string, @Body() dto: LinkContractPoDto) {
        return this.service.linkPurchaseOrder(id, dto.purchaseOrderId)
    }
}
