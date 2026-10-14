import {
    BadRequestException,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Req,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { MaterialCategoriesService } from './material-categories.service'
import { MmMutation, MmRead } from '../common/mm-mutation.decorator'
import { MM_REFERENCE_READ, mmFeatures } from '../../permissions/permissions.constants'
import { saveCategoryImage } from './category-image-storage'

type CategoryBody = {
    code?: string
    name: string
    description?: string
    parentId?: string
    sortOrder?: number
    imageUrl?: string
    isActive?: boolean
}

/**
 * Reads a category payload from JSON or multipart
 * (`data` = JSON string, `image` = optional image file). Same contract as
 * company logo uploads.
 */
async function readCategoryPayload(
    req: FastifyRequest,
): Promise<{ body: CategoryBody; image: Buffer | null }> {
    let raw: unknown = req.body ?? {}
    let image: Buffer | null = null

    if (req.isMultipart()) {
        raw = {}
        for await (const part of req.parts()) {
            if (part.type === 'file') {
                if (part.fieldname === 'image' && !image) {
                    image = await part.toBuffer()
                } else {
                    await part.toBuffer()
                }
            } else if (part.fieldname === 'data') {
                try {
                    raw = JSON.parse(String(part.value))
                } catch {
                    throw new BadRequestException('data must be valid JSON')
                }
            }
        }
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new BadRequestException('Category payload must be an object')
    }
    return { body: raw as CategoryBody, image }
}

@Controller('mm/material-categories')
export class MaterialCategoriesController {
    constructor(private readonly service: MaterialCategoriesService) {}

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

    @Post()
    @MmMutation(mmFeatures('material-master', 'material-categories'), 'create')
    async create(@Req() req: FastifyRequest) {
        const { body, image } = await readCategoryPayload(req)
        const imageUrl = image
            ? this.storeImage(image)
            : body.imageUrl || undefined
        return this.service.create({ ...body, imageUrl })
    }

    @Put(':id')
    @MmMutation(mmFeatures('material-master', 'material-categories'), 'update')
    async update(@Param('id') id: string, @Req() req: FastifyRequest) {
        const { body, image } = await readCategoryPayload(req)
        const imageUrl = image
            ? this.storeImage(image)
            : body.imageUrl !== undefined
              ? body.imageUrl
              : undefined
        return this.service.update(id, { ...body, imageUrl })
    }

    @Delete(':id')
    @MmMutation(mmFeatures('material-master', 'material-categories'), 'delete')
    remove(@Param('id') id: string) {
        return this.service.softDelete(id)
    }

    /** Validated image bytes → public URL (5 MB cap, PNG/JPG/WEBP/GIF). */
    private storeImage(buffer: Buffer): string {
        try {
            return saveCategoryImage(buffer)
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'Invalid image',
            )
        }
    }
}