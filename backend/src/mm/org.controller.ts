import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import {
    CreateBranchDto,
    CreateCompanyDto,
    UpdateBranchDto,
    UpdateCompanyDto,
} from './org.dto'
import { readCompanyPayload } from './org-company-payload'
import { OrgService } from './org.service'
import { MmMutation, MmRead } from './common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../permissions/permissions.constants'

@Controller('mm/org')
export class OrgController {
    constructor(private readonly service: OrgService) {}

    @Get('companies')
    @MmRead(MM_REFERENCE_READ)
    companies() {
        return this.service.findAllCompanies()
    }

    @Post('companies')
    @MmMutation(mmFeatures('organization', 'companies'), 'create')
    async createCompany(@Req() req: FastifyRequest) {
        const { dto, logo } = await readCompanyPayload(req, CreateCompanyDto)
        return this.service.createCompany(dto, logo)
    }

    @Put('companies/:id')
    @MmMutation(mmFeatures('organization', 'companies'), 'update')
    async updateCompany(
        @Param('id') id: string,
        @Req() req: FastifyRequest,
    ) {
        const { dto, logo } = await readCompanyPayload(req, UpdateCompanyDto)
        return this.service.updateCompany(id, dto, logo)
    }

    @Delete('companies/:id')
    @MmMutation(mmFeatures('organization', 'companies'), 'delete')
    deleteCompany(@Param('id') id: string) {
        return this.service.deleteCompany(id)
    }

    @Get('warehouses')
    @MmRead(MM_REFERENCE_READ)
    warehouses(@Query('companyId') companyId?: string) {
        return this.service.findAllWarehouses(companyId)
    }

    @Get('branches')
    @MmRead(MM_REFERENCE_READ)
    branches(
        @Query('companyId') companyId?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        return this.service.findAllBranches(companyId, activeOnly === 'true')
    }

    @Post('branches')
    @MmMutation(mmFeatures('organization', 'branches'), 'create')
    createBranch(@Body() body: CreateBranchDto) {
        return this.service.createBranch(body)
    }

    @Put('branches/:id')
    @MmMutation(mmFeatures('organization', 'branches'), 'update')
    updateBranch(
        @Param('id') id: string,
        @Body() body: UpdateBranchDto,
    ) {
        return this.service.updateBranch(id, body)
    }

    @Delete('branches/:id')
    @MmMutation(mmFeatures('organization', 'branches'), 'delete')
    deleteBranch(@Param('id') id: string) {
        return this.service.deleteBranch(id)
    }

    @Get('valuation-classes')
    @MmRead(MM_REFERENCE_READ)
    valuationClasses() {
        return this.service.findAllValuationClasses()
    }

    @Get('currencies')
    @MmRead(MM_REFERENCE_READ)
    currencies() {
        return this.service.findAllCurrencies()
    }
}
