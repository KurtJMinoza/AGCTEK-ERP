import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    BadRequestException,
} from '@nestjs/common'
import { SupplierBankService } from './supplier-bank.service'
import { CreateBankAccountDto } from './dto/create-bank-account.dto'

@Controller('mm/suppliers/:supplierId/bank-accounts')
export class SupplierBankController {
    constructor(private service: SupplierBankService) {}

    @Get()
    findAll(@Param('supplierId') supplierId: string) {
        return this.service.findBySupplier(supplierId)
    }

    @Post()
    create(
        @Param('supplierId') supplierId: string,
        @Body() dto: CreateBankAccountDto & { performedBy?: string },
    ) {
        const { performedBy, ...rest } = dto
        return this.service.create(supplierId, rest, performedBy)
    }

    @Get(':id/reveal')
    reveal(
        @Param('id') id: string,
        @Query('performedBy') performedBy?: string,
    ) {
        if (!performedBy?.trim()) {
            throw new BadRequestException(
                'performedBy is required to reveal bank account data (sensitive access audit)',
            )
        }
        return this.service.reveal(id, performedBy.trim())
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: Partial<CreateBankAccountDto> & { performedBy?: string },
    ) {
        const { performedBy, ...rest } = dto
        return this.service.update(id, rest, performedBy)
    }

    @Delete(':id')
    delete(@Param('id') id: string, @Query('performedBy') performedBy?: string) {
        return this.service.delete(id, performedBy)
    }
}
