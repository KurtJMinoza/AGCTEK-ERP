import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import {
    PRODUCT_IMAGE_MAX_BYTES,
    saveProductImage,
} from './product-image-storage'
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ReturnRequestService } from './return-request.service'
import { RequirePermission } from '../permissions/permission.guard'

export class ReturnRequestLineDto {
    @IsString()
    @IsNotEmpty()
    salesOrderLineId!: string

    @IsNumber()
    @Min(0.01)
    quantity!: number

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    conditionNote?: string
}

export class CreateReturnRequestDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsString()
    @IsNotEmpty()
    salesOrderId!: string

    @IsString()
    @IsNotEmpty()
    customerId!: string

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    conditionNote?: string

    @IsOptional()
    @IsString()
    @IsIn(['REFUND', 'REPLACEMENT', 'STORE_CREDIT'])
    preferredResolution?: string

    @IsOptional()
    photos?: unknown

    @IsOptional()
    @IsString()
    requestedBy?: string

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ReturnRequestLineDto)
    lines!: ReturnRequestLineDto[]
}

export class ApproveReturnRequestDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    approvedBy?: string

    /** Override resolution at approve: REFUND | REPLACEMENT | STORE_CREDIT */
    @IsOptional()
    @IsIn(['REFUND', 'REPLACEMENT', 'STORE_CREDIT'])
    preferredResolution?: string
}

export class RejectReturnRequestDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    reason?: string

    @IsOptional()
    @IsString()
    performedBy?: string
}

export class ReturnActionDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    performedBy?: string
}

export class CreateRefundDto extends ReturnActionDto {
    @IsOptional()
    @IsString()
    @IsIn(['CASH_REFUND', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'STORE_CREDIT'])
    refundMethod?: string
}

export class FailRefundDto extends ReturnActionDto {
    @IsOptional()
    @IsString()
    reason?: string
}

export class InspectReturnDto {
    @IsString()
    @IsNotEmpty()
    companyId!: string

    @IsOptional()
    @IsString()
    result?: string

    @IsOptional()
    @IsString()
    notes?: string

    @IsOptional()
    @IsString()
    performedBy?: string
}

/** Customer return requests (SD owns the request; MM owns stock disposition). */
@Controller('sd/returns')
export class ReturnRequestController {
    constructor(private returns: ReturnRequestService) {}

    /** Strictly company-scoped list (optional status / refundStatus filters). */
    @Get()
    @RequirePermission('sd.sales-orders', 'read')
    list(
        @Query('companyId') companyId?: string,
        @Query('status') status?: string,
        @Query('refundStatus') refundStatus?: string,
    ) {
        if (!companyId) {
            throw new BadRequestException('companyId is required')
        }
        return this.returns.list(companyId, { status, refundStatus })
    }

    @Post()
    @RequirePermission('sd.sales-orders', 'create')
    create(@Body() dto: CreateReturnRequestDto) {
        return this.returns.create(dto)
    }

    /** Multipart upload (field `file`); returns `{ imageUrl }` to attach as return evidence. */
    @Post('photos')
    @RequirePermission('sd.sales-orders', 'create')
    async uploadPhoto(@Req() req: FastifyRequest) {
        let buffer: Buffer | null = null
        for await (const part of req.parts({
            limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES, files: 1 },
        })) {
            if (part.type === 'file' && !buffer) buffer = await part.toBuffer()
        }
        if (!buffer) {
            throw new BadRequestException('No image file provided')
        }
        return { imageUrl: saveProductImage(buffer) }
    }

    @Post(':id/approve')
    @RequirePermission('sd.sales-orders', 'update')
    approve(@Param('id') id: string, @Body() dto: ApproveReturnRequestDto) {
        return this.returns.approve(id, dto.companyId, dto.approvedBy, {
            preferredResolution: dto.preferredResolution,
        })
    }

    @Post(':id/reject')
    @RequirePermission('sd.sales-orders', 'update')
    reject(@Param('id') id: string, @Body() dto: RejectReturnRequestDto) {
        return this.returns.reject(id, dto.companyId, {
            reason: dto.reason,
            performedBy: dto.performedBy,
        })
    }

    @Post(':id/receive')
    @RequirePermission('sd.sales-orders', 'update')
    receive(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.receive(id, dto.companyId, dto.performedBy)
    }

    @Post(':id/inspect')
    @RequirePermission('sd.sales-orders', 'update')
    inspect(@Param('id') id: string, @Body() dto: InspectReturnDto) {
        return this.returns.inspect(id, dto.companyId, {
            result: dto.result,
            notes: dto.notes,
            performedBy: dto.performedBy,
        })
    }

    @Post(':id/mark-restock')
    @RequirePermission('sd.sales-orders', 'update')
    markRestock(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.mark(id, dto.companyId, 'RESTOCK', dto.performedBy)
    }

    @Post(':id/mark-damaged')
    @RequirePermission('sd.sales-orders', 'update')
    markDamaged(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.mark(id, dto.companyId, 'BLOCK', dto.performedBy)
    }

    @Post(':id/mark-scrap')
    @RequirePermission('sd.sales-orders', 'update')
    markScrap(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.mark(id, dto.companyId, 'SCRAP', dto.performedBy)
    }

    @Post(':id/mark-needs-inspection')
    @RequirePermission('sd.sales-orders', 'update')
    markNeedsInspection(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.mark(id, dto.companyId, 'REPAIR', dto.performedBy)
    }

    /** Create the refund record (DEMO ONLY — never calls a real gateway). */
    @Post(':id/refund')
    @RequirePermission('sd.sales-orders', 'update')
    refund(@Param('id') id: string, @Body() dto: CreateRefundDto) {
        return this.returns.createRefund(id, dto.companyId, {
            refundMethod: dto.refundMethod,
            performedBy: dto.performedBy,
        })
    }

    /** COD never collected → mark the refund NOT_REQUIRED (no record). */
    @Post(':id/refund/not-required')
    @RequirePermission('sd.sales-orders', 'update')
    refundNotRequired(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.markRefundNotRequired(id, dto.companyId, dto.performedBy)
    }

    /** Approve the pending refund and issue the linked credit memo (Phase 8). */
    @Post(':id/refund/approve')
    @RequirePermission('sd.sales-orders', 'update')
    refundApprove(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.approveRefund(id, dto.companyId, dto.performedBy)
    }

    /** Mark the approved refund as PAID (demo settlement). */
    @Post(':id/refund/pay')
    @RequirePermission('sd.sales-orders', 'update')
    refundPay(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.payRefund(id, dto.companyId, dto.performedBy)
    }

    /** Fail the refund (no payment changes). */
    @Post(':id/refund/fail')
    @RequirePermission('sd.sales-orders', 'update')
    refundFail(@Param('id') id: string, @Body() dto: FailRefundDto) {
        return this.returns.failRefund(id, dto.companyId, {
            reason: dto.reason,
            performedBy: dto.performedBy,
        })
    }

    @Post(':id/close')
    @RequirePermission('sd.sales-orders', 'update')
    close(@Param('id') id: string, @Body() dto: ReturnActionDto) {
        return this.returns.close(id, dto.companyId, dto.performedBy)
    }
}