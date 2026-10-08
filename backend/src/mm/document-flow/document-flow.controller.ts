import { Controller, Get, Param, Query } from '@nestjs/common'
import { DocumentFlowService } from './document-flow.service'
import { MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ } from '../../permissions/permissions.constants'

@Controller('mm/document-flow')
export class DocumentFlowController {
    constructor(private documentFlow: DocumentFlowService) {}

    @Get(':documentType/:documentId')
    @MmRead(MM_REFERENCE_READ)
    getFlow(
        @Param('documentType') documentType: string,
        @Param('documentId') documentId: string,
        @Query('companyId') companyId?: string,
    ) {
        return this.documentFlow.getFlow(documentType, documentId, { companyId })
    }
}
