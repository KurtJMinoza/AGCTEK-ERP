import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common'
import { PackingService } from './packing.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { PackageQueryDto } from './dto/package-query.dto'
import { ScanItemDto } from './dto/scan-item.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('warehouse-management', 'overview', 'packing')

@Controller('mm/packages')
export class PackingController {
    constructor(private readonly service: PackingService) {}

    @Get()
    @MmRead(READERS)
    findAll(@Query() query: PackageQueryDto) {
        return this.service.findAll(query)
    }

    @Get(':id')
    @MmRead(READERS)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Post()
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'create')
    create(@Body() dto: CreatePackageDto) {
        return this.service.create(dto)
    }

    @Post('from-picking/:pickingTaskId')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'create')
    fromPicking(@Param('pickingTaskId') pickingTaskId: string) {
        return this.service.createFromPickingTask(pickingTaskId)
    }

    @Post(':id/scan')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
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
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    verify(@Param('id') id: string) {
        return this.service.verify(id)
    }

    @Post(':id/seal')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    seal(@Param('id') id: string) {
        return this.service.seal(id)
    }

    @Post(':id/ready-for-dispatch')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
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
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    retryScmRelease(@Param('id') id: string) {
        return this.service.retryScmRelease(id)
    }

    @Post(':id/dispatch')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    dispatch(@Param('id') id: string) {
        return this.service.dispatch(id)
    }
}
