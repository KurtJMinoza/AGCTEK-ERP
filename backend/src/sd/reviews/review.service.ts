import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateProductReviewDto, ListReviewsQueryDto } from './dto/review.dto'

@Injectable()
export class ReviewService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Strictly verifies whether a user is an eligible verified purchaser.
     * Eligible strictly if they have an SdSalesOrder with status DELIVERED
     * containing the current productId (or sku) in its line items.
     */
    async checkEligibility(productId: string, userId: string): Promise<boolean> {
        if (!userId || !productId) return false

        // Resolve product to get its ID and SKU
        const product = await this.prisma.sdProduct.findFirst({
            where: {
                OR: [{ id: productId }, { sku: productId }],
            },
            select: { id: true, sku: true },
        })
        if (!product) return false

        // Resolve user to get id and email
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        })
        if (!user) return false

        // Check if there is a linked retail client by email
        const retailClient = user.email
            ? await this.prisma.retailClient.findUnique({
                  where: { email: user.email },
                  select: { id: true },
              })
            : null

        const customerIds: string[] = [user.id]
        if (retailClient) customerIds.push(retailClient.id)

        // Query for an order with status DELIVERED containing the product in lines
        const deliveredOrder = await this.prisma.sdSalesOrder.findFirst({
            where: {
                status: { in: ['DELIVERED', 'delivered'] },
                OR: [
                    { createdBy: user.id },
                    { customerId: { in: customerIds } },
                    ...(user.email
                        ? [{ customerEmail: { equals: user.email, mode: 'insensitive' as const } }]
                        : []),
                ],
                lines: {
                    some: {
                        OR: [
                            { productId: product.id },
                            ...(product.sku ? [{ sku: product.sku }] : []),
                        ],
                    },
                },
            },
            select: { id: true },
        })

        return !!deliveredOrder
    }

    async create(dto: CreateProductReviewDto, headerUserId?: string) {
        // Resolve target product (by ID or SKU)
        let product = await this.prisma.sdProduct.findUnique({
            where: { id: dto.productId },
        })

        if (!product) {
            product = await this.prisma.sdProduct.findFirst({
                where: { sku: dto.productId },
            })
        }

        if (!product) {
            throw new NotFoundException(`Product with ID/SKU '${dto.productId}' not found`)
        }

        // Resolve user
        const targetUserId = dto.userId || headerUserId
        if (!targetUserId) {
            throw new ForbiddenException('A logged-in user is required to submit a review')
        }

        const user = await this.prisma.user.findUnique({ where: { id: targetUserId } })
        if (!user) {
            throw new ForbiddenException('User not found')
        }

        // Strict verification: user must have an SdSalesOrder with DELIVERED status containing the product
        const isEligible = await this.checkEligibility(product.id, user.id)
        if (!isEligible) {
            throw new ForbiddenException(
                'Only verified purchasers with a delivered order can review this product',
            )
        }

        const review = await this.prisma.productReview.create({
            data: {
                productId: product.id,
                userId: user.id,
                rating: dto.rating,
                comment: dto.comment.trim(),
                imageUrls: dto.imageUrls ?? [],
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        userName: true,
                        avatar: true,
                    },
                },
                product: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                    },
                },
            },
        })

        return review
    }

    async findAll(query: ListReviewsQueryDto) {
        let productWhere: { productId?: string } = {}

        if (query.productId) {
            let product = await this.prisma.sdProduct.findUnique({
                where: { id: query.productId },
                select: { id: true },
            })
            if (!product) {
                product = await this.prisma.sdProduct.findFirst({
                    where: { sku: query.productId },
                    select: { id: true },
                })
            }
            if (product) {
                productWhere = { productId: product.id }
            } else {
                return {
                    reviews: [],
                    total: 0,
                    averageRating: 0,
                }
            }
        }

        const reviews = await this.prisma.productReview.findMany({
            where: productWhere,
            orderBy: { createdAt: 'desc' },
            take: query.limit ?? 50,
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        userName: true,
                        avatar: true,
                    },
                },
            },
        })

        const total = reviews.length
        const averageRating =
            total > 0
                ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(1))
                : 0

        return {
            reviews,
            total,
            averageRating,
        }
    }

    async getStats(productId: string) {
        let product = await this.prisma.sdProduct.findUnique({
            where: { id: productId },
            select: { id: true },
        })
        if (!product) {
            product = await this.prisma.sdProduct.findFirst({
                where: { sku: productId },
                select: { id: true },
            })
        }

        if (!product) {
            return {
                totalReviews: 0,
                averageRating: 0,
                ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            }
        }

        const reviews = await this.prisma.productReview.findMany({
            where: { productId: product.id },
            select: { rating: true },
        })

        const totalReviews = reviews.length
        const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        let totalSum = 0

        for (const r of reviews) {
            totalSum += r.rating
            ratingCounts[r.rating] = (ratingCounts[r.rating] || 0) + 1
        }

        const averageRating =
            totalReviews > 0 ? Number((totalSum / totalReviews).toFixed(1)) : 0

        return {
            totalReviews,
            averageRating,
            ratingCounts,
        }
    }
}
