import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CRM_USER_SUMMARY_SELECT } from '../crm-references'

const MAX_RESULTS = 50

/** Owner / assignee picker for CRM records: active users, display fields only. */
@Injectable()
export class CrmUsersService {
    constructor(private readonly prisma: PrismaService) {}

    list(search?: string) {
        const term = search?.trim()
        const where: Prisma.UserWhereInput = {
            isActive: true,
            ...(term
                ? {
                      OR: [
                          { userName: { contains: term, mode: 'insensitive' } },
                          { firstName: { contains: term, mode: 'insensitive' } },
                          { lastName: { contains: term, mode: 'insensitive' } },
                      ],
                  }
                : {}),
        }
        return this.prisma.user.findMany({
            where,
            select: CRM_USER_SUMMARY_SELECT,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { userName: 'asc' }],
            take: MAX_RESULTS,
        })
    }
}
