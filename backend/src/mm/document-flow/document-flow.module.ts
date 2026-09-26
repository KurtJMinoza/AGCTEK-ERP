import { Module } from '@nestjs/common'
import { DocumentFlowController } from './document-flow.controller'
import { DocumentFlowService } from './document-flow.service'

@Module({
    controllers: [DocumentFlowController],
    providers: [DocumentFlowService],
    exports: [DocumentFlowService],
})
export class DocumentFlowModule {}
