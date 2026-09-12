import { Body, Controller, Post, UsePipes, ValidationPipe } from '@nestjs/common'
import { RfqService } from './rfq.service'
import { SaveQuotationComparisonDto } from './dto/quotation-comparison.dto'
import { MmMutation } from '../common/mm-mutation.decorator'

@Controller('mm/quotation-comparisons')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class QuotationComparisonController {
    constructor(private readonly rfqService: RfqService) {}

    @Post()
    @MmMutation()
    save(@Body() dto: SaveQuotationComparisonDto) {
        return this.rfqService.saveComparison(dto)
    }
}
