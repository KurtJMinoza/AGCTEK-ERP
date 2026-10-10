import {
    Body,
    Controller,
    Get,
    Param,
    Post,
} from '@nestjs/common'
import {
    SdAdjustDemandDto,
    SdAvailabilityBatchDto,
    SdAvailabilityCheckDateDto,
    SdAvailabilityCheckDto,
    SdReleaseBySourceDto,
    SdReserveDemandDto,
} from './dto/sd-integration.dto'
import { SdIntegrationService } from './sd-integration.service'
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('inventory-management', 'available-stock', 'reservations')

@Controller('mm/integration/sd')
export class SdIntegrationController {
    constructor(private sdIntegration: SdIntegrationService) {}

    @Post('availability/check')
    @MmRead(READERS)
    checkAvailability(@Body() dto: SdAvailabilityCheckDto) {
        return this.sdIntegration.checkAvailability(dto)
    }

    @Post('availability/check-batch')
    @MmRead(READERS)
    checkAvailabilityBatch(@Body() dto: SdAvailabilityBatchDto) {
        return this.sdIntegration.checkAvailabilityBatch(dto)
    }

    @Post('availability/check-date')
    @MmRead(READERS)
    checkAvailabilityByDate(@Body() dto: SdAvailabilityCheckDateDto) {
        return this.sdIntegration.checkAvailabilityByDate(dto)
    }

    @Post('reservations')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'create')
    reserve(@Body() dto: SdReserveDemandDto) {
        return this.sdIntegration.reserveDemand(dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/release')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'update')
    releaseBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: SdReleaseBySourceDto,
    ) {
        return this.sdIntegration.releaseBySourceDocument(sourceDocumentId, dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/adjust')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'update')
    adjustBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: SdAdjustDemandDto,
    ) {
        return this.sdIntegration.adjustBySourceDocument(sourceDocumentId, dto)
    }

    @Get('reservations/by-source/:sourceDocumentId/status')
    @MmRead(READERS)
    statusBySource(@Param('sourceDocumentId') sourceDocumentId: string) {
        return this.sdIntegration.getStatusBySourceDocument(sourceDocumentId)
    }
}
