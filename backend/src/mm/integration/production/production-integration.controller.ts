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
import { MmMutation, MmRead } from '../../common/mm-mutation.decorator'
import { mmFeatures } from '../../../permissions/permissions.constants'

/** Read access: the pages that load these endpoints. */
const READERS = mmFeatures('inventory-management', 'available-stock', 'reservations')

@Controller('mm/integration/production')
export class ProductionIntegrationController {
    constructor(private ppIntegration: ProductionIntegrationService) {}

    @Post('availability/check')
    @MmRead(READERS)
    checkAvailability(@Body() dto: PpAvailabilityCheckDto) {
        return this.ppIntegration.checkAvailability(dto)
    }

    @Post('availability/check-batch')
    @MmRead(READERS)
    checkAvailabilityBatch(@Body() dto: PpAvailabilityBatchDto) {
        return this.ppIntegration.checkAvailabilityBatch(dto)
    }

    @Post('availability/check-date')
    @MmRead(READERS)
    checkAvailabilityByDate(@Body() dto: PpAvailabilityCheckDateDto) {
        return this.ppIntegration.checkAvailabilityByDate(dto)
    }

    @Post('reservations')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'create')
    reserve(@Body() dto: PpReserveDemandDto) {
        return this.ppIntegration.reserveDemand(dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/release')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'update')
    releaseBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: PpReleaseBySourceDto,
    ) {
        return this.ppIntegration.releaseBySourceDocument(sourceDocumentId, dto)
    }

    @Post('reservations/by-source/:sourceDocumentId/adjust')
    @MmMutation(mmFeatures('inventory-management', 'reservations'), 'update')
    adjustBySource(
        @Param('sourceDocumentId') sourceDocumentId: string,
        @Body() dto: PpAdjustDemandDto,
    ) {
        return this.ppIntegration.adjustBySourceDocument(sourceDocumentId, dto)
    }

    @Get('reservations/by-source/:sourceDocumentId/status')
    @MmRead(READERS)
    statusBySource(@Param('sourceDocumentId') sourceDocumentId: string) {
        return this.ppIntegration.getStatusBySourceDocument(sourceDocumentId)
    }

    @Post('components/issue')
    @MmMutation(mmFeatures('inventory-management', 'goods-issue'), 'create')
    issueComponents(@Body() dto: PpIssueComponentsDto) {
        return this.ppIntegration.issueComponents(dto)
    }

    @Post('output/receive')
    @MmMutation(mmFeatures('inventory-management', 'goods-receipt'), 'create')
    receiveOutput(@Body() dto: PpReceiveOutputDto) {
        return this.ppIntegration.receiveOutput(dto)
    }
}
