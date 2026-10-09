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
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ReturnRequestService } from './return-request.service'

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
}

/** Customer return requests (SD owns the request; MM owns stock disposition). */
@Controller('sd/returns')
export class ReturnRequestController {
    constructor(private returns: ReturnRequestService) {}

    /** Strictly company-scoped list. */
    @Get()
    list(@Query('companyId') companyId?: string) {
        if (!companyId) {
            throw new BadRequestException('companyId is required')
        }
        return this.returns.list(companyId)
    }

    @Post()
    create(@Body() dto: CreateReturnRequestDto) {
        return this.returns.create(dto)
    }

    /** Multipart upload (field `file`); returns `{ imageUrl }` to attach as return evidence. */
    @Post('photos')
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
    approve(@Param('id') id: string, @Body() dto: ApproveReturnRequestDto) {
        return this.returns.approve(id, dto.companyId, dto.approvedBy)
    }
}