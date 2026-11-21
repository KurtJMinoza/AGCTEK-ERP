import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SetCustomerRatingDto } from './dto/customer-rating.dto'

const HISTORY_LIMIT = 50

@Injectable()
export class CrmCustomerRatingService {
    constructor(private readonly prisma: PrismaService) {}

    async getForCustomer(customerId: string) {
        await this.requireCustomer(customerId)
        const [current, history] = await Promise.all([
            this.prisma.crmCustomerRating.findUnique({ where: { customerId } }),
            this.prisma.crmCustomerRatingHistory.findMany({
                where: { customerId },
                orderBy: { ratedAt: 'desc' },
                take: HISTORY_LIMIT,
            }),
        ])
        return { current, history }
    }

    /**
     * Upserts the current rating and appends an immutable history row.
     * Relationship rating only — never touches loyalty or SD commercial docs.
     */
    async setRating(customerId: string, dto: SetCustomerRatingDto, ratedBy: string) {
        await this.requireCustomer(customerId)
        const comment = dto.comment?.trim() || null

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.crmCustomerRating.findUnique({
                where: { customerId },
            })
            const previousStars = existing?.stars ?? null

            const current = existing
                ? await tx.crmCustomerRating.update({
                      where: { customerId },
                      data: {
                          stars: dto.stars,
                          comment,
                          ratedBy,
                          ratedAt: new Date(),
                      },
                  })
                : await tx.crmCustomerRating.create({
                      data: {
                          customerId,
                          stars: dto.stars,
                          comment,
                          ratedBy,
                      },
                  })

            const historyRow = await tx.crmCustomerRatingHistory.create({
                data: {
                    customerId,
                    stars: dto.stars,
                    previousStars,
                    comment,
                    ratedBy,
                },
            })

            return { current, historyRow }
        })
    }

    private async requireCustomer(customerId: string) {
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { id: true },
        })
        if (!customer) throw new NotFoundException('Customer not found')
    }
}
