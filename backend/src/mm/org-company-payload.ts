import { BadRequestException } from '@nestjs/common'
import { plainToInstance, type ClassConstructor } from 'class-transformer'
import { validate } from 'class-validator'
import type { FastifyRequest } from 'fastify'

export async function readCompanyPayload<T extends object>(
    req: FastifyRequest,
    dtoClass: ClassConstructor<T>,
): Promise<{ dto: T; logo: Buffer | null }> {
    let raw: unknown = req.body ?? {}
    let logo: Buffer | null = null

    if (req.isMultipart()) {
        raw = {}
        for await (const part of req.parts()) {
            if (part.type === 'file') {
                if (part.fieldname === 'logo' && !logo) {
                    logo = await part.toBuffer()
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
        throw new BadRequestException('Company payload must be an object')
    }
    const dto = plainToInstance(dtoClass, raw)
    const errors = await validate(dto, { whitelist: true })
    if (errors.length > 0) {
        throw new BadRequestException(
            errors.flatMap((error) => Object.values(error.constraints ?? {})),
        )
    }
    return { dto, logo }
}
