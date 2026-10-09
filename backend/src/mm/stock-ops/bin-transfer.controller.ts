import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { BinTransferService } from './bin-transfer.service'
import { CreateBinTransferDto } from './dto/create-bin-transfer.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { mmFeatures } from '../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('inventory-management', 'stock-transfers')

@Controller('mm/bin-transfers')
export class BinTransferController {
    constructor(private service: BinTransferService) {}

    @Post()
    @MmMutation(mmFeatures('inventory-management', 'stock-transfers'), 'create')
    create(@Body() dto: CreateBinTransferDto) {
        return this.service.create(dto)
    }

    @Post(':id/post')
    @MmMutation(mmFeatures('inventory-management', 'stock-transfers'), 'update')
    post(@Param('id') id: string) {
        return this.service.post(id)
    }

    @Post(':id/cancel')
    @MmMutation(mmFeatures('inventory-management', 'stock-transfers'), 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @Post(':id/reverse')
    @MmMutation(mmFeatures('inventory-management', 'stock-transfers'), 'update')
    reverse(@Param('id') id: string, @Body() body: { createdBy?: string }) {
        return this.service.reverse(id, body?.createdBy)
    }

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
