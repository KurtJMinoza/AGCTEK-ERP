import { Controller, Get, Query } from '@nestjs/common'
import { OrgService } from './org.service'

@Controller('mm/org')
export class OrgController {
    constructor(private readonly service: OrgService) {}

    @Get('companies')
    companies() {
        return this.service.findAllCompanies()
    }

    @Get('warehouses')
    warehouses(@Query('companyId') companyId?: string) {
        return this.service.findAllWarehouses(companyId)
    }

    @Get('plants')
    plants(@Query('companyId') companyId?: string) {
        return this.service.findAllPlants(companyId)
    }

    @Get('branches')
    branches(
        @Query('companyId') companyId?: string,
        @Query('plantId') plantId?: string,
    ) {
        return this.service.findAllBranches(companyId, plantId)
    }

    @Get('valuation-classes')
    valuationClasses() {
        return this.service.findAllValuationClasses()
    }

    @Get('currencies')
    currencies() {
        return this.service.findAllCurrencies()
    }
}
