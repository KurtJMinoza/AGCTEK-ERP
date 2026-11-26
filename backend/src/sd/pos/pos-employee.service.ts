import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export type PosEmployeeOption = {
    id: string
    employeeCode: string
    fullName: string
}

@Injectable()
export class PosEmployeeService {
    constructor(private readonly prisma: PrismaService) {}

    /** Active users with an HR employee code — searched by full name for POS salary deduction. */
    async search(term: string, limit = 20): Promise<PosEmployeeOption[]> {
        const q = term.trim()
        if (q.length < 2) return []

        const rows = await this.prisma.user.findMany({
            where: {
                isActive: true,
                employeeCode: { not: null },
                OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { userName: { contains: q, mode: 'insensitive' } },
                ],
            },
            select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: Math.min(Math.max(limit, 1), 50),
        })

        return rows
            .filter((row): row is typeof row & { employeeCode: string } =>
                Boolean(row.employeeCode?.trim()),
            )
            .map((row) => ({
                id: row.id,
                employeeCode: row.employeeCode.trim(),
                fullName: [row.firstName, row.lastName]
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .join(' ')
                    .trim(),
            }))
            .filter((row) => row.fullName.length > 0)
    }
}