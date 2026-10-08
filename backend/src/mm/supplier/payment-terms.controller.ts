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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/payment-terms')
export class PaymentTermsController {
    constructor(private service: PaymentTermsService) {}

    @Post()
    @MmMutation(mmFeatures('supplier-management', 'payment-terms'), 'create')
    create(@Body() dto: CreatePaymentTermsDto) {
        return this.service.create(dto)
    }

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll() {
        return this.service.findAll()
    }

    @Get(':id')
    @MmRead(MM_REFERENCE_READ)
    findOne(@Param('id') id: string) {
        return this.service.findOne(id)
    }

    @Put(':id')
    @MmMutation(mmFeatures('supplier-management', 'payment-terms'), 'update')
    update(@Param('id') id: string, @Body() dto: Partial<CreatePaymentTermsDto>) {
        return this.service.update(id, dto)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('supplier-management', 'payment-terms'), 'delete')
    softDelete(@Param('id') id: string) {
        return this.service.softDelete(id)
    }
}
