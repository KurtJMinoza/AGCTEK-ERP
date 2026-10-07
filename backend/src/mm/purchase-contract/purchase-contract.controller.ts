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
    CreateContractReleaseDto,
} from './dto/purchase-contract.dto'
import { MmMutation } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

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
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    create(@Body() dto: CreatePurchaseContractDto) {
        return this.service.create(dto)
    }

    @Patch(':id')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    update(@Param('id') id: string, @Body() dto: UpdatePurchaseContractDto) {
        return this.service.update(id, dto)
    }

    @Post(':id/activate')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    activate(@Param('id') id: string) {
        return this.service.activate(id)
    }

    @Post(':id/expire')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    expire(@Param('id') id: string) {
        return this.service.expire(id)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
        return this.service.cancel(id, body?.reason)
    }

    @Post(':id/releases')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    release(@Param('id') id: string, @Body() dto: CreateContractReleaseDto) {
        return this.service.release(id, dto)
    }

    @Post(':id/link-po')
    @MmMutation(mmFeatures('procurement', 'purchase-contracts'))
    linkPo(@Param('id') id: string, @Body() dto: LinkContractPoDto) {
        return this.service.linkPurchaseOrder(id, dto.purchaseOrderId)
    }

    @Get(':id/audit')
    audit(@Param('id') id: string) {
        return this.service.getAudit(id)
    }
}
