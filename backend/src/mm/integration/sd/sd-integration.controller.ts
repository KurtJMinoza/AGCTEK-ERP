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

@Controller('mm/integration/sd')
export class SdIntegrationController {
    constructor(private sdIntegration: SdIntegrationService) {}

    @Post('availability/check')
    checkAvailability(@Body() dto: SdAvailabilityCheckDto) {
        return this.sdIntegration.checkAvailability(dto)
    }

    @Post('availability/check-batch')
    checkAvailabilityBatch(@Body() dto: SdAvailabilityBatchDto) {
        return this.sdIntegration.checkAvailabilityBatch(dto)
    }

    @Post('availability/check-date')
    checkAvailabilityByDate(@Body() dto: SdAvailabilityCheckDateDto) {
        return this.sdIntegration.checkAvailabilityByDate(dto)
    }

    @Post('reservations')
    reserve(@Body() dto: SdReserveDemandDto) {
        return this.sdIntegration.reserveDemand(dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/release')
    releaseBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: SdReleaseBySourceDto,
    ) {
        return this.sdIntegration.releaseBySourceDocument(sourceDocumentId, dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/adjust')
    adjustBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: SdAdjustDemandDto,
    ) {
        return this.sdIntegration.adjustBySourceDocument(sourceDocumentId, dto)
    }

    @Get('reservations/by-source/:sourceDocumentId/status')
    statusBySource(@Param('sourceDocumentId') sourceDocumentId: string) {
        return this.sdIntegration.getStatusBySourceDocument(sourceDocumentId)
    }
}
