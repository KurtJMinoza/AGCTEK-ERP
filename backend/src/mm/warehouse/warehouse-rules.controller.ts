import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common'
import { WarehouseRulesService } from './warehouse-rules.service'
import {
    CreatePutawayRuleDto,
    CreatePickingRuleDto,
    UpdatePutawayRuleDto,
    UpdatePickingRuleDto,
} from './dto/warehouse-rules.dto'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/warehouse-rules')
export class WarehouseRulesController {
    constructor(private readonly rules: WarehouseRulesService) {}

    @Get('putaway')
    @MmRead(MM_REFERENCE_READ)
    listPutaway(@Query('warehouseId') warehouseId?: string) {
        return this.rules.listPutawayRules(warehouseId)
    }

    @Post('putaway')
    @MmMutation(mmFeatures('warehouse-management', 'putaway-rules'), 'create')
    createPutaway(@Body() dto: CreatePutawayRuleDto) {
        return this.rules.createPutawayRule(dto)
    }

    @Put('putaway/:id')
    @MmMutation(mmFeatures('warehouse-management', 'putaway-rules'), 'update')
    updatePutaway(@Param('id') id: string, @Body() dto: UpdatePutawayRuleDto) {
        return this.rules.updatePutawayRule(id, dto)
    }

    @Delete('putaway/:id')
    @MmMutation(mmFeatures('warehouse-management', 'putaway-rules'), 'delete')
    deletePutaway(@Param('id') id: string) {
        return this.rules.deletePutawayRule(id)
    }

    @Get('picking')
    @MmRead(MM_REFERENCE_READ)
    listPicking(@Query('warehouseId') warehouseId?: string) {
        return this.rules.listPickingRules(warehouseId)
    }

    @Post('picking')
    @MmMutation(mmFeatures('warehouse-management', 'picking-rules'), 'create')
    createPicking(@Body() dto: CreatePickingRuleDto) {
        return this.rules.createPickingRule(dto)
    }

    @Put('picking/:id')
    @MmMutation(mmFeatures('warehouse-management', 'picking-rules'), 'update')
    updatePicking(@Param('id') id: string, @Body() dto: UpdatePickingRuleDto) {
        return this.rules.updatePickingRule(id, dto)
    }

    @Delete('picking/:id')
    @MmMutation(mmFeatures('warehouse-management', 'picking-rules'), 'delete')
    deletePicking(@Param('id') id: string) {
        return this.rules.deletePickingRule(id)
    }
}
