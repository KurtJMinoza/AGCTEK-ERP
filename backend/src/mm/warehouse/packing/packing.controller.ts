import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Body,
} from '@nestjs/common'
import { PackingService } from './packing.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { PackageQueryDto } from './dto/package-query.dto'
import { ScanItemDto } from './dto/scan-item.dto'
import {
    AdjustPackageItemDto,
    CompletePackingDto,
} from './dto/adjust-package-item.dto'
import { SealPackageDto } from './dto/seal-package.dto'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { MmUser, type MmRequestUser } from '../../common/mm-auth.decorator'
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

    /**
     * Scanner-first scan: send `barcode` or `materialCode` (or `materialId`),
     * `quantity` (default 1) and `scanType`. Resolves the material server-side,
     * rejects wrong items and over-scanning, and returns the full package
     * progress for the packing screen.
     */
    @Post(':id/scan')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    scanItem(
        @Param('id') id: string,
        @Body() dto: ScanItemDto,
        @MmUser() user: MmRequestUser,
    ) {
        return this.service.scanItem(id, dto, user)
    }

    /** Manual +1 / −1 / add quantity / reset when no scanner is available. */
    @Post(':id/items/:itemId/adjust')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    adjustItem(
        @Param('id') id: string,
        @Param('itemId') itemId: string,
        @Body() dto: AdjustPackageItemDto,
        @MmUser() user: MmRequestUser,
    ) {
        return this.service.adjustItem(id, itemId, dto, user)
    }

    /**
     * "Complete Packing" — blocked until every required quantity is scanned
     * unless an explicit partial completion (allowPartial + reason) is sent.
     */
    @Post(':id/complete')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    completePacking(
        @Param('id') id: string,
        @Body() dto: CompletePackingDto,
    ) {
        return this.service.completePacking(id, dto)
    }

    /** "Recently scanned" feed for the packing screen. */
    @Get(':id/scan-logs')
    @MmRead(READERS)
    scanLogs(@Param('id') id: string) {
        return this.service.recentScanLogs(id)
    }

    @Post(':id/verify')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    verify(@Param('id') id: string) {
        return this.service.verify(id)
    }

    @Post(':id/seal')
    @MmMutation(mmFeatures('warehouse-management', 'packing'), 'update')
    seal(@Param('id') id: string, @Body() dto: SealPackageDto) {
        return this.service.seal(id, dto)
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
