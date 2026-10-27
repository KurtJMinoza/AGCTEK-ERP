import { Controller, Get } from '@nestjs/common'
import { FoundationReadinessService } from './foundation-readiness.service'
import { MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ } from '../../permissions/permissions.constants'

@Controller('mm/foundation')
export class FoundationController {
    constructor(private readiness: FoundationReadinessService) {}

    @Get('readiness')
    @MmRead(MM_REFERENCE_READ)
    getReadiness() {
        return this.readiness.getReadiness()
    }
}
