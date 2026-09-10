import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
} from '@nestjs/common'
import { GoodsIssueService } from './goods-issue.service'
import { CreateGoodsIssueDto } from './dto/create-goods-issue.dto'
import { StockOpsQueryDto } from './dto/stock-ops-query.dto'
import {
    IsString,
    IsNotEmpty,
    IsDateString,
    IsOptional,
    IsIn,
} from 'class-validator'

class CreateGiFromPackageDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsDateString()
    postingDate!: string

    @IsDateString()
    documentDate!: string

    @IsOptional()
    @IsIn(['PRODUCTION', 'SALES', 'INTERNAL', 'OTHER'])
    issuePurpose?: string

    @IsOptional()
    @IsString()
    createdBy?: string
}

@Controller('mm/goods-issues')
export class GoodsIssueController {
    constructor(private service: GoodsIssueService) {}

    @Post()
    create(@Body() dto: CreateGoodsIssueDto) {
        return this.service.create(dto)
    }

    @Post('from-package/:packageId')
    fromPackage(
        @Param('packageId') packageId: string,
        @Body() dto: CreateGiFromPackageDto,
    ) {
        return this.service.createFromPackage(packageId, dto)
    }

    @Post(':id/post')
    post(@Param('id') id: string) {
        return this.service.post(id)
    }

    @Post(':id/cancel')
    cancel(@Param('id') id: string) {
        return this.service.cancel(id)
    }

    @Post(':id/reverse')
    reverse(@Param('id') id: string, @Body() body: { createdBy?: string }) {
        return this.service.reverse(id, body?.createdBy)
    }

    @Get()
    findAll(@Query() query: StockOpsQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }
}
