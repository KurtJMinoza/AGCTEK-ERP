import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
} from '@nestjs/common'
import { PaymentTermsService } from './payment-terms.service'
import { CreatePaymentTermsDto } from './dto/create-payment-terms.dto'

@Controller('mm/payment-terms')
export class PaymentTermsController {
    constructor(private service: PaymentTermsService) {}

    @Post()
    create(@Body() dto: CreatePaymentTermsDto) {
        return this.service.create(dto)
    }

    @Get()
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: Partial<CreatePaymentTermsDto>) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    softDelete(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
