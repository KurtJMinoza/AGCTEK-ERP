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
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'

@Controller('mm/suppliers/:supplierId/bank-accounts')
export class SupplierBankController {
    constructor(private service: SupplierBankService) {}

    @Get()
    @MmRead(MM_REFERENCE_READ)
    findAll(@Param('supplierId') supplierId: string) {
        return this.service.findBySupplier(supplierId)
    }

    @Post()
    @MmMutation(mmFeatures('supplier-management', 'supplier-master'), 'create')
    create(
        @Param('supplierId') supplierId: string,
        @Body() dto: CreateBankAccountDto & { performedBy?: string },
    ) {
        const { performedBy, ...rest } = dto
        return this.service.create(supplierId, rest, performedBy)
    }

    @Get(':id/reveal')
    @MmRead(MM_REFERENCE_READ)
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
    @MmMutation(mmFeatures('supplier-management', 'supplier-master'), 'update')
    update(
        @Param('id') id: string,
        @Body() dto: Partial<CreateBankAccountDto> & { performedBy?: string },
    ) {
        const { performedBy, ...rest } = dto
        return this.service.update(id, rest, performedBy)
    }

    @Delete(':id')
    @MmMutation(mmFeatures('supplier-management', 'supplier-master'), 'delete')
    delete(@Param('id') id: string, @Query('performedBy') performedBy?: string) {
        return this.service.delete(id, performedBy)
    }
}
