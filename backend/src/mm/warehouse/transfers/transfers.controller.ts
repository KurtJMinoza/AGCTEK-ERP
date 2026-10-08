import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { TransfersService } from './transfers.service'
import { CreateTransferDto } from './dto/create-transfer.dto'
import { TransferQueryDto } from './dto/transfer-query.dto'
import { PickTransferLineDto } from './dto/pick-transfer-line.dto'
import { ReceiveTransferLineDto } from './dto/receive-transfer-line.dto'
import { ApproveTransferDto } from './dto/approve-transfer.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = [...mmFeatures('inventory-management', 'stock-transfers'), ...mmFeatures('warehouse-management', 'warehouse-transfers')]

@Controller('mm/warehouse-transfers')
export class TransfersController {
    constructor(private readonly service: TransfersService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: TransferQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'create')
    create(@Body() dto: CreateTransferDto) {
        return this.service.create(dto)
    }

    @Post(':id/approve')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    approve(@Param('id') id: string, @Body() dto: ApproveTransferDto) {
        return this.service.approve(id, dto.approvedBy)
    }

    @Post(':id/pick')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    pick(@Param('id') id: string, @Body() dto: PickTransferLineDto) {
        return this.service.pick(id, dto.lineId, dto.pickedQty)
    }

    @Post(':id/dispatch')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }

    @Post(':id/receive')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    receive(@Param('id') id: string, @Body() dto: ReceiveTransferLineDto) {
        return this.service.receive(id, dto.lineId, dto.receivedQty)
    }

    @Post(':id/complete')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    complete(@Param('id') id: string) {
        return this.service.complete(id)
    }

    @Post(':id/cancel')
    @MmMutation([...mmFeatures('warehouse-management', 'warehouse-transfers'), ...mmFeatures('inventory-management', 'stock-transfers')], 'update')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }
}
