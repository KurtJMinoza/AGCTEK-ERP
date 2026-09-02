import {
    BadRequestException,
    NotFoundException,
} from '@nestjs/common'

export type PaginatedResult<T> = {
    data: T[]
    total: number
    page: number
    pageSize: number
}

export type ListQuery = {
    page?: string
    pageSize?: string
    status?: string
    search?: string
}

export function parsePagination(query: ListQuery): {
    page: number
    pageSize: number
    skip: number
} {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    return { page, pageSize, skip: (page - 1) * pageSize }
}

export function assertFound<T>(value: T | null | undefined, message: string): T {
    if (value == null) {
        throw new NotFoundException(message)
    }
    return value
}

export function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new BadRequestException(`${field} is required`)
    }
    return value.trim()
}

export function optionalString(value: unknown): string | undefined {
    if (value == null || value === '') return undefined
    if (typeof value !== 'string') {
        throw new BadRequestException('Expected a string value')
    }
    return value.trim()
}

export function requireNumber(value: unknown, field: string): number {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) {
        throw new BadRequestException(`${field} must be a number`)
    }
    return n
}

export function optionalNumber(value: unknown): number | undefined {
    if (value == null || value === '') return undefined
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) {
        throw new BadRequestException('Expected a number value')
    }
    return n
}

export function optionalDate(value: unknown): Date | undefined {
    if (value == null || value === '') return undefined
    const d = value instanceof Date ? value : new Date(String(value))
    if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid date')
    }
    return d
}

export function optionalBoolean(value: unknown): boolean | undefined {
    if (value == null || value === '') return undefined
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    throw new BadRequestException('Expected a boolean value')
}
