import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { TransfersService } from './transfers.service'
import { CreateTransferDto } from './dto/create-transfer.dto'
import { TransferQueryDto } from './dto/transfer-query.dto'
import { PickTransferLineDto } from './dto/pick-transfer-line.dto'
import { ReceiveTransferLineDto } from './dto/receive-transfer-line.dto'
import { ApproveTransferDto } from './dto/approve-transfer.dto'

@Controller('mm/warehouse-transfers')
export class TransfersController {
    constructor(private readonly service: TransfersService) {}

    @Get()
    findAll(@Query() query: TransferQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreateTransferDto) {
        return this.service.create(dto)
    }

    @Post(':id/approve')
    approve(@Param('id') id: string, @Body() dto: ApproveTransferDto) {
        return this.service.approve(id, dto.approvedBy)
    }

    @Post(':id/pick')
    pick(@Param('id') id: string, @Body() dto: PickTransferLineDto) {
        return this.service.pick(id, dto.lineId, dto.pickedQty)
    }

    @Post(':id/dispatch')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }

    @Post(':id/receive')
    receive(@Param('id') id: string, @Body() dto: ReceiveTransferLineDto) {
        return this.service.receive(id, dto.lineId, dto.receivedQty)
    }

    @Post(':id/complete')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
