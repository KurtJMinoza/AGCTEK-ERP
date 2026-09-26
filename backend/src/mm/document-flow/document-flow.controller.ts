import { Controller, Get, Param, Query } from '@nestjs/common'
import { DocumentFlowService } from './document-flow.service'

@Controller('mm/document-flow')
export class DocumentFlowController {
    constructor(private documentFlow: DocumentFlowService) {}

    @Get(':documentType/:documentId')
    getFlow(
        @Param('documentType') documentType: string,
        @Param('documentId') documentId: string,
        @Query('companyId') companyId?: string,
    ) {
        return this.documentFlow.getFlow(documentType, documentId, { companyId })
    }
}
