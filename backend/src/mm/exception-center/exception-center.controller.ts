import { Controller, Get, Param, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { ExceptionCenterService } from './exception-center.service'
import { ExceptionCenterQueryDto } from './dto/exception-center.dto'
import type { MmExceptionFilters } from './exception-center.types'

@Controller('mm/exceptions')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ExceptionCenterController {
    constructor(private exceptions: ExceptionCenterService) {}

    @Get()
    list(@Query() query: ExceptionCenterQueryDto) {
        return this.exceptions.list(this.toFilters(query))
    }

    @Get('counts')
    counts(@Query() query: ExceptionCenterQueryDto) {
        return this.exceptions.getCounts(this.toFilters(query))
    }

    @Get(':id')
    getOne(@Param('id') id: string, @Query() query: ExceptionCenterQueryDto) {
        return this.exceptions.getOne(id, this.toFilters(query))
    }

    private toFilters(query: ExceptionCenterQueryDto): MmExceptionFilters {
        return {
            companyId: query.companyId,
            plantId: query.plantId,
            warehouseId: query.warehouseId,
            severity: query.severity,
            domain: query.domain,
            status: query.status,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            includeStale: query.includeStale,
            page: query.page,
            limit: query.limit,
            role: query.role,
            authority: query.authority,
        }
    }
}
