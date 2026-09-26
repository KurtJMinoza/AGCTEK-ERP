import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
} from '@nestjs/common'
import {
    CreateBranchDto,
    CreateCompanyDto,
    CreatePlantDto,
    UpdateBranchDto,
    UpdateCompanyDto,
    UpdatePlantDto,
} from './org.dto'
import { OrgService } from './org.service'

@Controller('mm/org')
export class OrgController {
    constructor(private readonly service: OrgService) {}

    @Get('companies')
    companies() {
        return this.service.findAllCompanies()
    }

    @Post('companies')
    createCompany(@Body() body: CreateCompanyDto) {
        return this.service.createCompany(body)
    }

    @Put('companies/:id')
    updateCompany(
        @Param('id') id: string,
        @Body() body: UpdateCompanyDto,
    ) {
        return this.service.updateCompany(id, body)
    }

    @Delete('companies/:id')
    deleteCompany(@Param('id') id: string) {
        return this.service.deleteCompany(id)
    }

    @Get('warehouses')
    warehouses(@Query('companyId') companyId?: string) {
        return this.service.findAllWarehouses(companyId)
    }

    @Get('plants')
    plants(
        @Query('companyId') companyId?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        return this.service.findAllPlants(companyId, activeOnly === 'true')
    }

    @Post('plants')
    createPlant(@Body() body: CreatePlantDto) {
        return this.service.createPlant(body)
    }

    @Put('plants/:id')
    updatePlant(
        @Param('id') id: string,
        @Body() body: UpdatePlantDto,
    ) {
        return this.service.updatePlant(id, body)
    }

    @Delete('plants/:id')
    deletePlant(@Param('id') id: string) {
        return this.service.deletePlant(id)
    }

    @Get('branches')
    branches(
        @Query('companyId') companyId?: string,
        @Query('plantId') plantId?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        return this.service.findAllBranches(companyId, plantId, activeOnly === 'true')
    }

    @Post('branches')
    createBranch(@Body() body: CreateBranchDto) {
        return this.service.createBranch(body)
    }

    @Put('branches/:id')
    updateBranch(
        @Param('id') id: string,
        @Body() body: UpdateBranchDto,
    ) {
        return this.service.updateBranch(id, body)
    }

    @Delete('branches/:id')
    deleteBranch(@Param('id') id: string) {
        return this.service.deleteBranch(id)
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
