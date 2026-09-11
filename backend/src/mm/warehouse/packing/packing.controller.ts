import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PackingService } from './packing.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { PackageQueryDto } from './dto/package-query.dto'
import { ScanItemDto } from './dto/scan-item.dto'

@Controller('mm/packages')
export class PackingController {
    constructor(private readonly service: PackingService) {}

    @Get()
    findAll(@Query() query: PackageQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    create(@Body() dto: CreatePackageDto) {
        return this.service.create(dto)
    }

    @Post('from-picking/:pickingTaskId')
    fromPicking(@Param('pickingTaskId') pickingTaskId: string) {
        return this.service.createFromPickingTask(pickingTaskId)
    }

    @Post(':id/scan')
    scanItem(@Param('id') id: string, @Body() dto: ScanItemDto) {
        return this.service.scanItem(
            id,
            dto.materialId,
            dto.quantity ?? 1,
            dto.batchId,
            dto.serialId,
            dto.idempotencyKey,
        )
    }

    @Post(':id/verify')
    verify(@Param('id') id: string) {
        return this.service.verify(id)
    }

    @Post(':id/seal')
    seal(@Param('id') id: string) {
        return this.service.seal(id)
    }

    @Post(':id/ready-for-dispatch')
    readyForDispatch(
        @Param('id') id: string,
        @Body()
        body?: {
            shipToName?: string
            shipToAddress?: string
            shipToLat?: number
            shipToLng?: number
        },
    ) {
        return this.service.markReadyForDispatch(id, body)
    }

    @Post(':id/retry-scm-release')
    retryScmRelease(@Param('id') id: string) {
        return this.service.retryScmRelease(id)
    }

    @Post(':id/dispatch')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }
}
