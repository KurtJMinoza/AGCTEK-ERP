import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { RateCustomerDto } from './dto/rate-customer.dto'

const HISTORY_LIMIT = 50

@Injectable()
export class CrmCustomerRatingsService {
    constructor(private readonly prisma: PrismaService) {}

    async rate(customerId: string, dto: RateCustomerDto, ratedBy: string) {
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { id: true },
        })
        if (!customer) throw new NotFoundException('Customer not found')

        const now = new Date()
        const comment = dto.comment?.trim() || null

        return this.prisma.$transaction(async (tx) => {
            const profile = await tx.crmProfile.findUnique({ where: { customerId } })
            const previousStars = profile?.ratingStars ?? null

            const event = await tx.crmCustomerRatingEvent.create({
                data: {
                    customerId,
                    stars: dto.stars,
                    comment,
                    previousStars,
                    ratedBy,
                    ratedAt: now,
                },
            })

            const snapshot = {
                ratingStars: dto.stars,
                ratedAt: now,
                ratedBy,
                updatedBy: ratedBy,
            }

            if (profile) {
                await tx.crmProfile.update({
                    where: { customerId },
                    data: snapshot,
                })
            } else {
                await tx.crmProfile.create({
                    data: {
                        customerId,
                        ...snapshot,
                        createdBy: ratedBy,
                    },
                })
            }

            return event
        })
    }

    async history(customerId: string, take = HISTORY_LIMIT) {
        const customer = await this.prisma.sdCustomer.findUnique({
            where: { id: customerId },
            select: { id: true },
        })
        if (!customer) throw new NotFoundException('Customer not found')

        return this.prisma.crmCustomerRatingEvent.findMany({
            where: { customerId },
            orderBy: { ratedAt: 'desc' },
            take,
        })
    }
}
