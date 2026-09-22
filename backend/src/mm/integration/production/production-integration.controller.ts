import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import {
    PpAdjustDemandDto,
    PpAvailabilityBatchDto,
    PpAvailabilityCheckDateDto,
    PpAvailabilityCheckDto,
    PpIssueComponentsDto,
    PpReceiveOutputDto,
    PpReleaseBySourceDto,
    PpReserveDemandDto,
} from './dto/production-integration.dto'
import { ProductionIntegrationService } from './production-integration.service'

@Controller('mm/integration/production')
export class ProductionIntegrationController {
    constructor(private ppIntegration: ProductionIntegrationService) {}

    @Post('availability/check')
    checkAvailability(@Body() dto: PpAvailabilityCheckDto) {
        return this.ppIntegration.checkAvailability(dto)
    }

    @Post('availability/check-batch')
    checkAvailabilityBatch(@Body() dto: PpAvailabilityBatchDto) {
        return this.ppIntegration.checkAvailabilityBatch(dto)
    }

    @Post('availability/check-date')
    checkAvailabilityByDate(@Body() dto: PpAvailabilityCheckDateDto) {
        return this.ppIntegration.checkAvailabilityByDate(dto)
    }

    @Post('reservations')
    reserve(@Body() dto: PpReserveDemandDto) {
        return this.ppIntegration.reserveDemand(dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/release')
    releaseBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: PpReleaseBySourceDto,
    ) {
        return this.ppIntegration.releaseBySourceDocument(sourceDocumentId, dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/adjust')
    adjustBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: PpAdjustDemandDto,
    ) {
        return this.ppIntegration.adjustBySourceDocument(sourceDocumentId, dto)
    }

    @Get('reservations/by-source/:sourceDocumentId/status')
    statusBySource(@Param('sourceDocumentId') sourceDocumentId: string) {
        return this.ppIntegration.getStatusBySourceDocument(sourceDocumentId)
    }

    @Post('components/issue')
    issueComponents(@Body() dto: PpIssueComponentsDto) {
        return this.ppIntegration.issueComponents(dto)
    }

    @Post('output/receive')
    receiveOutput(@Body() dto: PpReceiveOutputDto) {
        return this.ppIntegration.receiveOutput(dto)
    }
}
