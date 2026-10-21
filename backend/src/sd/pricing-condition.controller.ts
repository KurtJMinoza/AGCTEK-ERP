import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    Query,
} from '@nestjs/common'
import { CurrentUser, type AuthRequestUser } from '../auth/auth.decorator'
import { RequirePermission } from '../permissions/permission.guard'
import {
    CreatePricingConditionDto,
    ListPricingConditionsQueryDto,
    UpdateBasePriceDto,
    UpdatePricingConditionDto,
} from './dto/pricing-condition.dto'
import { PricingConditionService } from './pricing-condition.service'

/**
 * SD pricing conditions: base price list (PR00 = catalog price), quantity tier
 * discounts and promos. Tier discounts and promos are records only for now —
 * order pricing still charges the catalog price.
 */
@Controller('sd/pricing-conditions')
export class PricingConditionController {
    constructor(private readonly pricing: PricingConditionService) {}

    @Get()
    @RequirePermission('sd.pricing-conditions', 'read')
    list(@Query() query: ListPricingConditionsQueryDto) {
        return this.pricing.list(query)
    }

    @Post()
    @RequirePermission('sd.pricing-conditions', 'create')
    create(
        @Body() dto: CreatePricingConditionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.pricing.create(dto, user)
    }

    @Put('base-prices/:productId')
    @RequirePermission('sd.pricing-conditions', 'update')
    updateBasePrice(
        @Param('productId') productId: string,
        @Body() dto: UpdateBasePriceDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.pricing.updateBasePrice(productId, dto.price, user)
    }

    @Patch(':id')
    @RequirePermission('sd.pricing-conditions', 'update')
    update(
        @Param('id') id: string,
        @Body() dto: UpdatePricingConditionDto,
        @CurrentUser() user: AuthRequestUser,
    ) {
        return this.pricing.update(id, dto, user)
    }

    @Post(':id/expire')
    @HttpCode(200)
    @RequirePermission('sd.pricing-conditions', 'update')
    expire(@Param('id') id: string, @CurrentUser() user: AuthRequestUser) {
        return this.pricing.expire(id, user)
    }
}
